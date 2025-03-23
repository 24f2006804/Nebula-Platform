import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ethers, BigNumber } from 'ethers';
import { useWeb3 } from '../web3/hooks/useWeb3';
import { ipfsService } from '../web3/utils/ipfs';
import { Project, Milestone } from '../types/contracts';
import MilestoneVerificationStatus from './MilestoneVerificationStatus';
import WalletPrompt from './WalletPrompt';
import './ProjectDetails.css';

interface ProjectMetadata {
    title: string;
    description: string;
    category: string;
    files: string[];
    createdAt: string;
    creator: string;
}

const ProjectDetails: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { contractInterface, account, needsWallet, connectWallet } = useWeb3();
    const [project, setProject] = useState<Project | null>(null);
    const [metadata, setMetadata] = useState<ProjectMetadata | null>(null);
    const [fundAmount, setFundAmount] = useState('');
    const [selectedMilestone, setSelectedMilestone] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [txPending, setTxPending] = useState(false);

    const loadProject = useCallback(async () => {
        if (!contractInterface || !id) return;
        
        setLoading(true);
        setError('');

        try {
            const projectData = await contractInterface.getProjectDetails(id);
            
            const transformedProject: Project = {
                projectId: id,
                title: projectData.title,
                description: projectData.description,
                researcher: projectData.researcher,
                totalFunding: ethers.utils.parseUnits(projectData.totalFunding.split('.')[0], 'ether'),
                currentFunding: ethers.utils.parseUnits(projectData.currentFunding.split('.')[0], 'ether'),
                isActive: projectData.isActive,
                category: projectData.category,
                createdAt: BigNumber.from(projectData.createdAt || '0'),
                metadataURI: projectData.metadataURI,
                isCancelled: Boolean(projectData.isActive === false),
                deadline: BigNumber.from(projectData.deadline || '0'),
                milestones: projectData.milestones.map((m: any) => ({
                    description: m.description,
                    targetAmount: ethers.utils.parseUnits(m.targetAmount.split('.')[0], 'ether'),
                    currentAmount: ethers.utils.parseUnits(m.currentAmount.split('.')[0], 'ether'),
                    isCompleted: m.isCompleted,
                    fundsReleased: Boolean(m.fundsReleased),
                    verificationCriteria: m.verificationCriteria || ''
                }))
            };

            setProject(transformedProject);

            // Load metadata from IPFS with fallback to on-chain data
            if (projectData.metadataURI) {
                try {
                    const metadata = await ipfsService.fetchIPFSContent(projectData.metadataURI);
                    setMetadata(metadata);
                } catch (err) {
                    console.warn('Failed to load IPFS metadata, using fallback:', err);
                    setMetadata({
                        title: projectData.title,
                        description: projectData.description,
                        category: projectData.category,
                        files: [],
                        createdAt: new Date(projectData.createdAt * 1000).toISOString(),
                        creator: projectData.researcher
                    });
                }
            } else {
                // Use on-chain data if no metadataURI is provided
                setMetadata({
                    title: projectData.title,
                    description: projectData.description,
                    category: projectData.category,
                    files: [],
                    createdAt: new Date(projectData.createdAt * 1000).toISOString(),
                    creator: projectData.researcher
                });
            }
        } catch (err: any) {
            console.error('Failed to load project:', err);
            const errorMessage = err.message?.includes('Project not found') 
                ? 'Project not found' 
                : 'Failed to load project details. Please try again.';
            setError(errorMessage);
            setProject(null);
            setMetadata(null);
        } finally {
            setLoading(false);
        }
    }, [contractInterface, id]);

    useEffect(() => {
        loadProject();
    }, [loadProject]);

    const handleFund = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!contractInterface || !account || !id || !project) return;

        setTxPending(true);
        setError('');

        try {
            // Convert amount to wei
            const amountInWei = ethers.utils.parseEther(fundAmount);
            
            // Validate amount against milestone target
            const milestone = project.milestones[selectedMilestone];
            const remainingAmount = milestone.targetAmount.sub(milestone.currentAmount);
            if (amountInWei.gt(remainingAmount)) {
                throw new Error('Amount exceeds milestone target');
            }

            const tx = await contractInterface.fundProject(
                id,
                selectedMilestone.toString()
            );
            await tx.wait();
            
            await loadProject();
            setFundAmount('');
        } catch (err: any) {
            console.error('Failed to fund project:', err);
            setError(err.message || 'Failed to fund project');
        } finally {
            setTxPending(false);
        }
    };

    if (needsWallet) {
        return (
            <WalletPrompt 
                message="Connect your wallet to view and fund this research project"
                onConnect={connectWallet}
            />
        );
    }

    if (loading) return <div className="loading">Loading project details...</div>;
    if (error) return <div className="error">{error}</div>;
    if (!project || !metadata) return <div className="error">Project not found</div>;

    const totalFunding = ethers.utils.formatEther(project.totalFunding);
    const currentFunding = ethers.utils.formatEther(project.currentFunding);
    const progressPercentage = (parseFloat(currentFunding) / parseFloat(totalFunding)) * 100;
    const isResearcher = account && project && account.toLowerCase() === project.researcher.toLowerCase();

    return (
        <div className="project-details">
            <button onClick={() => navigate('/research')} className="back-button">
                ← Back to Research Hub
            </button>

            <div className="project-header">
                <h1>{metadata.title}</h1>
                <div className="project-meta">
                    <span className="category">{metadata.category}</span>
                    <span className="researcher">
                        By: {project.researcher.slice(0, 6)}...{project.researcher.slice(-4)}
                    </span>
                    <span className="date">
                        Created: {new Date(metadata.createdAt).toLocaleDateString()}
                    </span>
                </div>
            </div>

            <div className="project-description">
                <h2>About this Research</h2>
                <p>{metadata.description}</p>
                
                {metadata.files && metadata.files.length > 0 && (
                    <div className="project-files">
                        <h3>Project Files</h3>
                        <ul>
                            {metadata.files.map((cid, index) => (
                                <li key={index}>
                                    <a 
                                        href={ipfsService.getIPFSUrl(cid)} 
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        View File {index + 1}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            <div className="funding-status">
                <h2>Funding Progress</h2>
                <div className="progress-bar">
                    <div 
                        className="progress" 
                        style={{ width: `${progressPercentage}%` }}
                    />
                </div>
                <div className="funding-info">
                    <span>{currentFunding} AVAX raised</span>
                    <span>Goal: {totalFunding} AVAX</span>
                </div>

                {project.isActive && !isResearcher && (
                    <form onSubmit={handleFund} className="funding-form">
                        <h3>Support this Research</h3>
                        <div className="form-group">
                            <label>Select Milestone to Fund</label>
                            <select
                                value={selectedMilestone}
                                onChange={(e) => setSelectedMilestone(Number(e.target.value))}
                                required
                            >
                                {project.milestones.map((m, idx) => {
                                    const remainingFunding = ethers.utils.formatEther(
                                        m.targetAmount.sub(m.currentAmount)
                                    );
                                    return (
                                        <option key={idx} value={idx} disabled={m.isCompleted}>
                                            Milestone {idx + 1} ({remainingFunding} AVAX remaining)
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                        <div className="input-group">
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={fundAmount}
                                onChange={e => setFundAmount(e.target.value)}
                                placeholder="Amount in AVAX"
                                required
                            />
                            <button type="submit" disabled={txPending || !fundAmount}>
                                {txPending ? 'Processing...' : 'Fund Project'}
                            </button>
                        </div>
                        {error && <div className="error-message">{error}</div>}
                    </form>
                )}
            </div>

            <div className="milestones">
                <h2>Research Milestones</h2>
                {project.milestones.map((milestone: Milestone, index: number) => (
                    <div 
                        key={index} 
                        className={`milestone ${milestone.isCompleted ? 'completed' : ''}`}
                    >
                        <div className="milestone-header">
                            <h3>Milestone {index + 1}</h3>
                            {milestone.isCompleted && (
                                <span className="status completed">Completed</span>
                            )}
                        </div>
                        
                        <p className="milestone-description">
                            {milestone.description}
                        </p>
                        
                        <div className="milestone-funding">
                            <div className="milestone-progress-bar">
                                <div 
                                    className="progress" 
                                    style={{ 
                                        width: `${(milestone.currentAmount.mul(100).div(milestone.targetAmount)).toString()}%`
                                    }}
                                />
                            </div>
                            <div className="funding-info">
                                <span>
                                    {ethers.utils.formatEther(milestone.currentAmount)} / {ethers.utils.formatEther(milestone.targetAmount)} AVAX
                                </span>
                            </div>
                        </div>

                        {!milestone.fundsReleased && (
                            <MilestoneVerificationStatus
                                projectId={id || ''}
                                milestoneId={index.toString()}
                                verificationCriteria={milestone.verificationCriteria}
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ProjectDetails;