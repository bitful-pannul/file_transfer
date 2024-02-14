export const trimPathToFilename = (filename: string) => {
    return filename.split('/').pop() || '';
}

export const trimPathToRootDir = (filename: string) => {
    return filename.split('/').slice(0, 2).join('/');
}

export const trimPathToFolder = (filename: string) => {
    return filename.split('/').slice(0, -1).join('/');
}

