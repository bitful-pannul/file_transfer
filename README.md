# File Transfer

[todo link to cookbook entry]

## Example commands

### List files from node

```/m riodejaneiro.nec@file_transfer:file_transfer:template.nec "ListFiles"```

### Download a file from node

```/m our@file_transfer:file_transfer:template.nec {"Download": {"name": "greco.mp4", "target": "riodejaneiro.nec@file_transfer:file_transfer:template.nec"}}```
