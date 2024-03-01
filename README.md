# Kino Files

https://book.kinode.org/cookbook/file_transfer.html

## Example commands

### List files from node

```
m riodejaneiro.os@kino_files:kino_files:gloriainexcelsisdeo.os "ListFiles" -a 5
```

### Download a file from node

```
m our@kino_files:kino_files:gloriainexcelsisdeo.os {"Download": {"name": "greco.mp4", "target": "riodejaneiro.os@kino_files:kino_files:gloriainexcelsisdeo.os"}}
```
