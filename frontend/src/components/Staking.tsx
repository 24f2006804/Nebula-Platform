import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useWeb3 } from '../web3/hooks/useWeb3';
import WalletPrompt from './WalletPrompt';
import './Staking.css';

interface StakeInfo {
  amount: string;
  timestamp: number;
  lockPeriod: number;
  currentReward: string;
}

const Staking: React.FC = () => {
  const { contractInterface, account, needsWallet, connectWallet } = useWeb3();
  const [stakeInfo, setStakeInfo] = useState<StakeInfo | null>(null);
  const [neblBalance, setNeblBalance] = useState('0');
  const [amount, setAmount] = useState('');
  const [lockPeriod, setLockPeriod] = useState('7');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [txPending, setTxPending] = useState(false);

  const loadStakeInfo = useCallback(async () => {
    if (!contractInterface || !account) return;
    
    try {
      // Initialize contract first
      const neblToken = await contractInterface.getNEBLToken();
      const info = await neblToken.getStakeInfo(account);
      
      // Format the info properly
      setStakeInfo({
        amount: ethers.utils.formatEther(info.amount),
        timestamp: info.timestamp.toNumber(),
        lockPeriod: info.lockPeriod.toNumber(),
        currentReward: ethers.utils.formatEther(info.currentReward)
      });
    } catch (err) {
      console.error('Failed to load stake info:', err);
      // Don't set error here as it's not a user action
    }
  }, [contractInterface, account]);

  const loadNeblBalance = useCallback(async () => {
    if (!contractInterface || !account) return;
    
    try {
      const neblToken = await contractInterface.getNEBLToken();
      const balance = await neblToken.balanceOf(account);
      setNeblBalance(ethers.utils.formatEther(balance));
    } catch (err) {
      console.error('Failed to load NEBL balance:', err);
    } finally {
      setLoading(false);
    }
  }, [contractInterface, account]);

  useEffect(() => {
    if (contractInterface && account) {
      loadStakeInfo();
      loadNeblBalance();
    }
  }, [contractInterface, account, loadStakeInfo, loadNeblBalance]);

  const handleStake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractInterface || !account) return;

    setTxPending(true);
    setError('');
    
    try {
      // Convert days to seconds for the contract
      const lockPeriodSeconds = parseInt(lockPeriod) * 24 * 60 * 60;
      await contractInterface.stakeNEBL(amount, lockPeriodSeconds);
      
      // Reload data
      await loadStakeInfo();
      await loadNeblBalance();
      
      // Reset form
      setAmount('');
    } catch (err: any) {
      console.error('Staking failed:', err);
      setError(err.message || 'Failed to stake NEBL');
    } finally {
      setTxPending(false);
    }
  };

  const isStakeLocked = useCallback(() => {
    if (!stakeInfo) return false;
    const currentTime = Math.floor(Date.now() / 1000);
    return currentTime < stakeInfo.timestamp + stakeInfo.lockPeriod;
  }, [stakeInfo]);

  const getUnlockDate = useCallback(() => {
    if (!stakeInfo) return null;
    return new Date((stakeInfo.timestamp + stakeInfo.lockPeriod) * 1000);
  }, [stakeInfo]);

  const handleUnstake = async () => {
    if (!contractInterface || !account) return;

    if (isStakeLocked()) {
      const unlockDate = getUnlockDate();
      setError(`Your stake is still locked until ${unlockDate?.toLocaleString()}. Please wait until the lock period expires.`);
      return;
    }

    setTxPending(true);
    setError('');
    
    try {
      await contractInterface.unstakeNEBL();
      await loadStakeInfo();
      await loadNeblBalance();
    } catch (err: any) {
      console.error('Unstaking failed:', err);
      // Make the error message more user-friendly
      if (err.message?.includes('Stake still locked')) {
        const unlockDate = getUnlockDate();
        setError(`Your stake is still locked until ${unlockDate?.toLocaleString()}. Please wait until the lock period expires.`);
      } else {
        setError(err.message || 'Failed to unstake NEBL');
      }
    } finally {
      setTxPending(false);
    }
  };

  const calculateAPR = (days: number) => {
    const baseAPR = 5; // 5%
    const maxBonusAPR = 15; // 15%
    const bonusAPR = (days * maxBonusAPR) / 365;
    return baseAPR + bonusAPR;
  };

  if (needsWallet) {
    return (
      <WalletPrompt 
        message="Connect your wallet to stake NEBL tokens and earn rewards"
        onConnect={connectWallet}
      />
    );
  }

  if (loading) return <div className="loading">Loading staking info...</div>;

  return (
    <div className="staking">
      <div className="staking-header">
        <h1>Stake NEBL</h1>
        <div className="nebl-balance">
          Available: {neblBalance} NEBL
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="staking-container">
        <div className="current-stake">
          <h2>Your Stake</h2>
          {stakeInfo && parseFloat(stakeInfo.amount) > 0 ? (
            <div className="stake-info">
              <div className="info-row">
                <span>Staked Amount:</span>
                <span>{stakeInfo.amount} NEBL</span>
              </div>
              <div className="info-row">
                <span>Lock Period:</span>
                <span>{stakeInfo.lockPeriod / (24 * 60 * 60)} days</span>
              </div>
              <div className="info-row">
                <span>Current Reward:</span>
                <span>{stakeInfo.currentReward} NEBL</span>
              </div>
              <div className="info-row">
                <span>Stake Date:</span>
                <span>{new Date(stakeInfo.timestamp * 1000).toLocaleDateString()}</span>
              </div>
              <div className="info-row">
                <span>Lock Status:</span>
                <span>{isStakeLocked() ? 
                  `Locked until ${getUnlockDate()?.toLocaleString()}` : 
                  'Unlocked - Ready to unstake'}</span>
              </div>
              <button 
                className="unstake-button"
                onClick={handleUnstake}
                disabled={txPending || isStakeLocked()}
              >
                {txPending ? 'Processing...' : isStakeLocked() ? 
                  'Locked' : 'Unstake'}
              </button>
            </div>
          ) : (
            <div className="no-stake">
              No active stake
            </div>
          )}
        </div>

        <div className="stake-form">
          <h2>New Stake</h2>
          <form onSubmit={handleStake}>
            <div className="form-group">
              <label>Amount (NEBL)</label>
              <input
                type="number"
                step="0.000001"
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Enter amount to stake"
                required
              />
            </div>
            <div className="form-group">
              <label>Lock Period (Days)</label>
              <select
                value={lockPeriod}
                onChange={e => setLockPeriod(e.target.value)}
                required
              >
                <option value="7">7 days - {calculateAPR(7)}% APR</option>
                <option value="30">30 days - {calculateAPR(30)}% APR</option>
                <option value="90">90 days - {calculateAPR(90)}% APR</option>
                <option value="180">180 days - {calculateAPR(180)}% APR</option>
                <option value="365">365 days - {calculateAPR(365)}% APR</option>
              </select>
            </div>
            <button type="submit" disabled={txPending}>
              {txPending ? 'Processing...' : 'Stake NEBL'}
            </button>
          </form>
        </div>

        <div className="staking-info">
          <h2>Staking Benefits</h2>
          <div className="benefits">
            <div className="benefit">
              <h3>Governance Power</h3>
              <p>Stake NEBL to participate in governance and vote on proposals</p>
            </div>
            <div className="benefit">
              <h3>Flexible APR</h3>
              <p>Earn up to 20% APR based on lock duration</p>
            </div>
            <div className="benefit">
              <h3>Platform Fees</h3>
              <p>Receive a share of platform fees when you stake</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Staking;