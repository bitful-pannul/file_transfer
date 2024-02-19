# File Transfer

https://book.kinode.org/cookbook/file_transfer.html

## Example commands

### List files from node

```
m riodejaneiro.os@file_transfer:file_transfer:template.os "ListFiles" -a 5
```

### Download a file from node

```
m our@file_transfer:file_transfer:template.os {"Download": {"name": "greco.mp4", "target": "riodejaneiro.os@file_transfer:file_transfer:template.os"}}
```
