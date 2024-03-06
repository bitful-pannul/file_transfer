
import KinoFile from '../types/KinoFile';
import { useEffect, useState } from 'react';
import useFileTransferStore from '../store/fileTransferStore';
import '@nosferatu500/react-sortable-tree/style.css';
import SortableTree, { TreeItem } from '@nosferatu500/react-sortable-tree';
import FileExplorerTheme from '@nosferatu500/theme-file-explorer';
import FileEntry from './FileEntry';
import { TreeFile } from '../types/TreeFile';
import { trimPathToRootDir } from '../utils/file';
import { FaChevronDown, FaChevronUp, FaFolderPlus, FaX } from 'react-icons/fa6';
import classNames from 'classnames';

interface Props {
  files: KinoFile[];
  node: string;
}

const MyFiles = ({ files, node }: Props) => {    
    const { onAddFolder, onMoveFile, refreshFiles, errors, setErrors, clearErrors } = useFileTransferStore();
    const [createdFolderName, setCreatedFolderName] = useState<string>('')
    const [isCreatingFolder, setIsCreatingFolder] = useState<boolean>(false)
    const [treeData, setTreeData] = useState<TreeItem[]>([])
    const [expandedFiles, setExpandedFiles] = useState<{ [path: string]: boolean }>({})

    const clearError = (index: number) => {
        setErrors(errors.filter((_, i) => i !== index))
    }

    const onFolderAdded = () => {
        onAddFolder('', createdFolderName, () => {
            setIsCreatingFolder(false);

            setTimeout(() => {
                refreshFiles();
            }, 1000);
        })
    };
    
    const toggleExpandedForOne = (path: string, expanded: boolean) => {
        setExpandedFiles((prev) => ({ ...prev, [path]: expanded }));
    }

    const treeifyFile: (f: KinoFile) => TreeItem = (file: KinoFile) => {
        const expanded = file.dir 
            ? expandedFiles[file.name]
            : undefined
        return {
            title: <FileEntry 
                file={file} 
                node={our.node} 
                isOurFile={true} 
                expanded={expanded} 
                onToggleExpand={() => toggleExpandedForOne(file.name, !expanded)} 
            />,
            children: file.dir 
                ? file.dir.map((f: KinoFile) => treeifyFile(f)) 
                : undefined,
            file,
            expanded: !!expandedFiles[file.name]
        } as TreeItem;
    }
    const onFileMoved = ({ node, nextParentNode }: { node: TreeFile, nextParentNode: TreeFile, prevPath: number[], nextPath: number[] }) => {
        console.log('moving file', node, nextParentNode)
        setTimeout(() => {
            refreshFiles();
        }, 1000);
        if (node.file.dir) return alert('Cannot move a directory');
        if (!nextParentNode) {
            nextParentNode = { 
                file: { 
                    name: trimPathToRootDir(node.file.name), 
                    dir: [], 
                    size: 0 
                } 
            };
        } else if (!nextParentNode.file.dir) return alert('Destination must be a directory');
        
        onMoveFile(node as TreeFile, nextParentNode as TreeFile);
    }

    useEffect(() => {
        const td = files.map((file: KinoFile) => treeifyFile(file)).sort((a, b) => a.file.name.localeCompare(b.file.name));
        console.log({ td })
        setTreeData(td);
    }, [files, expandedFiles]);

    const expand = (expanded: boolean) => {
        files.forEach(file => {
            toggleExpandedForOne(file.name, expanded)
        })
    }
    
    return (
        <div className='flex flex-col grow self-stretch'>
            <div className='flex place-items-center'>
                <h2 className='px-2 py-1 flex place-items-center'>
                    <span className='heading'>{node}</span>
                    {!isCreatingFolder && <button
                        className='icon ml-4'
                        onClick={() => setIsCreatingFolder(!isCreatingFolder)}
                    >
                        <FaFolderPlus />
                    </button>}
                </h2>
                <button
                    onClick={() => expand(true)}
                    className='clear ml-2'
                >
                    <FaChevronDown className='mr-2 text-[12px]' />
                    <span>Expand All</span>
                </button>
                <button
                    onClick={() => expand(false)}
                    className='clear ml-2'
                >
                    <FaChevronUp className='mr-2 text-[12px]' />
                    <span>Collapse All</span>
                </button>
            </div>
            {isCreatingFolder && <div className='flex flex-col p-2'>
                <span className='mx-auto mb-1'>Create a new folder in /:</span>
                <div className="flex">
                    <input
                        className='grow'
                        type="text"
                        value={createdFolderName}
                        placeholder='folder name'
                        onChange={(e) => setCreatedFolderName(e.target.value)}
                    />
                    <button
                        className='icon ml-2'
                        onClick={onFolderAdded}
                    >
                        <FaFolderPlus />
                    </button>
                    <button
                        className='icon ml-2'
                        onClick={() => setIsCreatingFolder(false)}
                    >
                        <FaX />
                    </button>
                </div>
            </div>}
            <div className='grow h-[50vh] overflow-y-auto'>
                {files.length === 0
                    ? <span className='text-white px-2 py-1'>No files... yet.</span>
                    : <SortableTree
                        theme={FileExplorerTheme}
                        treeData={treeData}
                        onChange={treeData => setTreeData([...treeData])}
                        canNodeHaveChildren={(node: TreeItem) => node.file.dir}
                        onMoveNode={onFileMoved}
                        getNodeKey={({ node }: { node: TreeItem }) => node.file.name}
                        onVisibilityToggle={({ expanded, node }) => toggleExpandedForOne(node?.file?.name, expanded)}
                    />
                }
            </div>
            <div className={classNames('flex flex-col bg-red-500/50 p-1', { hidden: errors.length === 0 })}>
                {errors.map((error, i) => <span key={i} 
                    className='px-2 py-1 flex place-items-center'
                >
                    <span className='flex-grow'>{error}</span>
                    <button 
                        className='bg-white/10 hover:bg-white/20 py-1 px-1 rounded ml-2'
                        onClick={() => clearError(i)}
                    >
                        <FaX />
                    </button>
                </span>)}
                {errors.length > 1 && <button 
                    className='bg-white/10 hover:bg-white/20 py-1 px-1 rounded ml-2'
                    onClick={clearErrors}
                >
                    Clear All
                </button>}
            </div>
        </div>
    );
};

export default MyFiles;