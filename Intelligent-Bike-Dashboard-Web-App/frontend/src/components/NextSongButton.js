import React from 'react';
import styles from './NextSongButton.module.scss';
import nextIcon from '../assets/playForward.svg'; 

const NextSongButton = ({ onNext }) => {
    return (
        <button className={styles.nextSongButton} onClick={onNext}>
            <img src={nextIcon} alt="Next" />
        </button>
    );
};

export default NextSongButton;
