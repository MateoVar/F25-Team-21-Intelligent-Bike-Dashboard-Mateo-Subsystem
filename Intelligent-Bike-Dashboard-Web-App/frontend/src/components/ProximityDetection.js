import React from 'react';
import styles from './ProximityDetection.module.scss';
import alertIcon from '../assets/AlertCircleOutline.svg'; // Assuming you have a next icon

const ProximityDetection = ({ direction }) => {
    // Function to determine position on screen
    const getPositionClass = (dir) => {
        switch (dir) {
            case 1:
                return styles.topLeft;
            case 2:
                return styles.topRight;
            case 3:
                return styles.bottomLeft;
            case 4:
                return styles.bottomRight;
            default:
                return '';
        }
    };
    const positionClass = getPositionClass(direction);
    
    return (
        <>
            {positionClass && (
                <div className={`${styles.container} ${positionClass}`}>
                    <div className={styles.dot}></div>
                    <img src={alertIcon} alt="Proximity Alert" className={styles.icon} />
                </div>
            )}
        </> 
    );
};

export default ProximityDetection;