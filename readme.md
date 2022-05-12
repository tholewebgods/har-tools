
# HAR tools

Command line (CLI) tool to inspect HAR files.

## Commands

### `har-ws-dig dump` - Dump the messages of all Websocket sessions

#### Examples:

```
$ har-ws-dig dump acme.com.har
```

Grep for the beginning of the two Websocket sessions 19 and 208, remove the timestamp and diff them side-by-side:

```
$ diff -y \
    <( har-ws-dig dump acme.com.har | grep -E -A 40 '\[19\]' | sed -r 's/^202.*Z \s+[0-9]+ //' ) \
    <( har-ws-dig dump acme.com.har | grep -E -A 40 '\[208\]' | sed -r 's/^202.*Z \s+[0-9]+ //' )
```



# Status

In development
