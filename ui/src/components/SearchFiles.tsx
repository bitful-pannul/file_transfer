import { useEffect, useState } from 'react';
import KinoFile from '../types/KinoFile';
import FileEntry from './FileEntry';
import useFileTransferStore from '../store/fileTransferStore';
import SortableTree, { TreeItem } from '@nosferatu500/react-sortable-tree';
import FileExplorerTheme from '@nosferatu500/theme-file-explorer';
import { FaChevronDown, FaChevronUp, FaMagnifyingGlass } from 'react-icons/fa6';

const SearchFiles = function() {
    const { knownNodes, setKnownNodes } = useFileTransferStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [foundFiles, setFoundFiles] = useState<KinoFile[] | undefined>();
    const [searching, setSearching] = useState<boolean>(false);
    const [expandedFiles, setExpandedFiles] = useState<{ [path:string]: boolean }>({})
    const [treeData, setTreeData] = useState<TreeItem[]>([])

    const handleSearch = () => {
        if (!searchTerm) return alert('Please enter a node name.');
        if (!searchTerm.match(/^[a-zA-Z0-9-]+\.os$/)) return alert('Invalid node name.');
        if (searching) return
        setKnownNodes([...knownNodes, searchTerm].filter((v, i, a) => a.indexOf(v) === i));
        setSearching(true);
        try {
            fetch(`${import.meta.env.BASE_URL}/files?node=${searchTerm}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            }).then((response) => response.json())
            .catch(() => {
                window.alert(`${searchTerm} appears to be offline, or has not installed Kino Files.`)
                setSearching(false);
            })
            .then((data) => {
                try {
                    setFoundFiles(data.ListFiles)
                    setSearching(false);
                } catch {
                    console.log("Failed to parse JSON files", data);
                }
            });
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const treeifyFile: (node: string, f: KinoFile) => TreeItem = (node: string, file: KinoFile) => {
        return {
            title: <FileEntry 
                file={file} 
                node={node} 
                isOurFile={false} 
                expanded={expandedFiles[file.name]} 
                onToggleExpand={() => toggleExpandedForOne(file.name, !expandedFiles[file.name])} 
            />,
            children: file.dir ? file.dir.map((f: KinoFile) => treeifyFile(node,f)) : undefined,
            file,
            expanded: !!expandedFiles[file.name]
        } as TreeItem;
    }

    const toggleExpandedForOne = (path: string, expanded: boolean) => {
        setExpandedFiles((prev) => ({ ...prev, [path]: expanded }));
    }

    const expand = (expanded: boolean) => {
        foundFiles?.forEach(file => {
            toggleExpandedForOne(file.name, expanded)
        })
    }

    useEffect(() => {
        if (foundFiles) {
            const td = foundFiles.map(file => treeifyFile(searchTerm, file))
            setTreeData(td || [])
        }
    }, [foundFiles, expandedFiles])

    return (
        <div className='flex flex-col grow'>
            <h3 className='text-center mb-4'>Search files on the network</h3>
            <div className='flex place-items-center self-stretch mb-4'>
                <div className='flex grow place-items-center relative'>
                    <span className='mr-2'>Node:</span>
                    <input
                        type="text"
                        value={searchTerm}
                        placeholder='somenode.os'
                        disabled={searching}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <button
                        onClick={handleSearch}
                        className='clear absolute right-1 top-1 text-sm'
                    >
                        <FaMagnifyingGlass />
                    </button>
                </div>
                {knownNodes.length > 0 && <div 
                    className='flex grow place-items-center'
                >
                    <span className='mx-2'>or:</span>
                    <select
                        className='w-full'
                        onChange={(e) => {setSearchTerm(e.target.value)}}
                        disabled={searching}
                    >
                        <option value=''>Select a known node</option>
                        {knownNodes.filter(n => n !== our.node).map((node) => (
                            <option key={node} value={node}>{node}</option>
                        ))}
                    </select>
                </div>}
            </div>
            <div className='obox flex flex-col grow'>
                {searching && <span>Searching...</span>}
                {!searching && !foundFiles && <span>Enter a node name to search for files.</span>}
                {!searching && foundFiles && <div 
                    className='flex place-items-center'
                >
                    <h2>
                        Search Results
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
                </div>}
                {!searching && foundFiles && foundFiles.length === 0 && <span className='text-white'>No files found.</span>}
                {foundFiles && foundFiles.length > 0 && <div className='flex flex-col px-2 py-1 grow'>
                    <h2>
                        <span className='text-xl font-bold font-mono'>{searchTerm}:</span> <span className='text-xs'>{foundFiles.length} files</span>
                    </h2>
                    <div className='grow -ml-8 -mr-6'>
                        <SortableTree
                            theme={FileExplorerTheme}
                            treeData={treeData}
                            onChange={treeData => setTreeData([...treeData])}
                            getNodeKey={({ node }: { node: TreeItem }) => node.file.name}
                            onVisibilityToggle={({ expanded, node }) => {
                                setExpandedFiles((prev) => ({ ...prev, [node?.file?.name]: expanded }))
                            }}
                            canDrag={() => false}
                            canDrop={() => false}
                        />
                    </div>
                </div>}
            </div>
        </div>
    );
};

export default SearchFiles;
