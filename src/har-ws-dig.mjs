#!/usr/bin/env node

/* References:
 *
 * - https://bugs.chromium.org/p/chromium/issues/detail?id=496006
 * - https://github.com/zaproxy/zap-extensions/blob/1b029ae1e6a1f10299d01b74b5efd743379aa0b0/addOns/websocket/src/main/java/org/zaproxy/zap/extension/websocket/WebSocketMessage.java#L71
 */

import { readFileSync } from "fs";
import { basename } from "path";

function fail(message) {
	console.log(message);
	process.exit(1);
}

function usage() {
	const bname = basename(process.argv[1]).replace(/\.mjs$/, "");

	console.log(`
		Usage: ${bname} <command> <file>
		       ... | ${bname} <command> ; ${bname} <command> < <file>

		COMMANDS

		   dump           Dump all Websocket sessions
	`.trim().replace(/^\t+/, ""));
}

function readStdin() {
	return new Promise((resolve, reject) => {
		let content = "";

		process.stdin.resume();

		process.stdin.on("data", (chunk) => {
			content += chunk;
		});

		process.stdin.on("end", () => {
			resolve(content);
		});

		process.stdin.on("error", (e) => {
			reject(e);
		});
	});
}

function leftPad(data, toLength = 5) {
	const str = String(data);
	const pad = Math.max(0, toLength - str.length);
	let padStr = "";
	for (let i = 0; i < pad; i++) {
		padStr += " ";
	}
	return padStr + str;
}

/**
 * Format time string or unix epoch number as ISO date
 */
function formatTime(time) {
	let date;
	if (typeof time === "number") {
		date = new Date(time * 1000);
	} else {
		date = new Date(time);
	}
	return date.toISOString();
}

/**
 * Adds "__entryNo" (zero indexed) to the request/response entry
 */
function addEntryNo(entry, entryNo) {
	return { __entryNo: entryNo, ...entry };
}

/**
 * Extract all message with type websocket
 */
function extractWebsocketRequests(har) {
	const entries = har.log.entries;

	return entries
		.map(addEntryNo)
		.filter((entry) => entry._resourceType === "websocket");
}

/**
 * Print infos of a Websocket request and response w/o messages
 */
function printRequestData(request, { fullUrl } = { }) {
	const { method, url: urlRaw } = request.request;
	const { status, statusText } = request.response;
	const { startedDateTime, __entryNo: requestNo } = request;
	const url = fullUrl ? urlRaw : `${urlRaw.substr(0, 50)}...`;

	console.log(`${formatTime(startedDateTime)} [${requestNo}] ${method} ${url} -> ${status} ${statusText}`);
}

const WS_MSG_OPCODES = new Map();

WS_MSG_OPCODES.set(0, "CONTINUATION");
WS_MSG_OPCODES.set(1, "ASCII");
WS_MSG_OPCODES.set(2, "BINARY");
WS_MSG_OPCODES.set(0x08, "CLOSE");
WS_MSG_OPCODES.set(0x09, "PING");
WS_MSG_OPCODES.set(0x0A, "PONG");

const WS_MSG_OPCODES_REV = Object.fromEntries([...WS_MSG_OPCODES.entries()]
									.map((e) => e.reverse()));

const WS_MSG_TYPE_PP = { "receive": "RECV", "send": "SEND" };

function decodeBase64(base64) {
	return Buffer.from(base64, "base64").toString("ascii");
}

/**
 * Print the Websocket messages
 */
function printMessages(messages, { fullData, rawData } = { }) {
	// type, opcode, time, data
	messages.forEach((message, msgNumber) => {
		const truncateLength = 70;
		const { time, type: typeRaw, opcode: opcodeRaw, data: dataRaw } = message;
		const type = WS_MSG_TYPE_PP[typeRaw];
		const opcode = WS_MSG_OPCODES.get(opcodeRaw).substring(0, 3);
		let data = dataRaw;

		if (opcodeRaw === WS_MSG_OPCODES_REV.BINARY) {
			data = `<BINARY DATA> (${decodeBase64(dataRaw).length} Bytes)`;
		} else if (WS_MSG_OPCODES_REV.ASCII && data.length > truncateLength && !fullData) {
			data = `${dataRaw.substring(0, truncateLength)}... (truncated, ${Math.max(0, dataRaw.length - truncateLength)} chars more)`;
		}

		if (opcodeRaw === WS_MSG_OPCODES_REV.ASCII && !rawData) {
			data = data.replace(/\n/g, "\\n").replace(/\t/g, " ");
		}

		console.log(`${formatTime(time)} ${leftPad(msgNumber)} ${type} ${opcode} ${data}`);
	});
}

function dump(contents) {
	const har = JSON.parse(contents);

	const websocketRequests = extractWebsocketRequests(har);

	websocketRequests.map((request, requestNo) => {
		printRequestData(request, { fullUrl: false, requestNo });
		printMessages(request._webSocketMessages, { });
	});
}

const commands = {
	dump,
};

async function main(args) {
	if (process.stdin.isTTY && args.length < 2) {
		usage();
		process.exit(0);
	}

	const [ command, filename ] = args;

	if (!(command in commands)) {
		fail(`Command not found: ${command}`);
	}

	let contents;

	if (process.stdin.isTTY) {
		contents = readFileSync(filename, "utf-8");
	} else {
		contents = await readStdin();
	}

	commands[command](contents);
}

main(process.argv.splice(2));
