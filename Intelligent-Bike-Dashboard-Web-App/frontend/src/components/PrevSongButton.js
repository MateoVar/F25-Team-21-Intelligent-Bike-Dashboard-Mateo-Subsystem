import React from 'react';
import styles from './PrevSongButton.module.scss';
import prevIcon from '../assets/playBack.svg'; 
const PrevSongButton = ({ onPrevious }) => {
    return (
        <button className={styles.prevSongButton} onClick={onPrevious}>
            <img src={prevIcon} alt="Previous" />
        </button>
    );
};

export default PrevSongButton;
