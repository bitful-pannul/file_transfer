export const trimPathToFilename = (filename: string) => {
    return filename.split('/').pop() || '';
}

export const trimPathToRootDir = (filename: string) => {
    return filename.split('/').slice(0, 2).join('/');
}

export const trimPathToParentFolder = (filename: string) => {
    return filename.split('/').slice(0, -1).join('/');
}

export const trimBasePathFromPath = (filename: string) => {
    return filename.split('/files/').pop() || filename
}

export const getReadableFilesize = (size: number) => size > 1000000000000
    ? `${(size / 1000000000000).toFixed(2)} TB`
    : size > 1000000000
    ? `${(size / 1000000000).toFixed(2)} GB`
    : size > 1000000
    ? `${(size / 1000000).toFixed(2)} MB`
    : size === 0
    ? ''
    : `${(size / 1000).toFixed(2)} KB`;
