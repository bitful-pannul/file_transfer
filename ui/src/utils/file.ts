export const trimPathToFilename = (filename: string) => {
    return filename.split('/').pop() || '';
}

export const getRootPath = (filename: string) => {
    return filename.split('/').slice(0, 2).join('/');
}