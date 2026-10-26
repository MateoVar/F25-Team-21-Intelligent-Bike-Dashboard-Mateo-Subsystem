import { useRef, useCallback } from 'react';

// Touch handling so pinch/pan gestures don't accidentally set a destination
export const useMapboxTouchHandlers = (mapRef, setIsMultiTouch) => {
  // Ref to track touch state
  const touchStateRef = useRef({
    isMultiTouch: false,
    touchCount: 0,
    lastTouchEnd: 0,
    touchStartTime: 0,
    touchStartPositions: [],
    hasMoved: false,
    clickBlockedUntil: 0
  });

  // Ref to store touch handlers for cleanup
  const touchHandlersRef = useRef(null);

  const setupTouchHandlers = useCallback(() => {
    if (!mapRef.current) return null;

    const mapContainer = mapRef.current.getContainer();

    const handleTouchStart = (e) => {
      const now = Date.now();
      touchStateRef.current.touchCount = e.touches.length;
      touchStateRef.current.touchStartTime = now;
      touchStateRef.current.hasMoved = false;

      touchStateRef.current.touchStartPositions = Array.from(e.touches).map(touch => ({
        x: touch.clientX,
        y: touch.clientY,
        identifier: touch.identifier
      }));

      if (e.touches.length > 1) {
        touchStateRef.current.isMultiTouch = true;
        setIsMultiTouch(true);
        touchStateRef.current.clickBlockedUntil = now + 1000;
      } else {
        touchStateRef.current.isMultiTouch = false;
        touchStateRef.current.clickBlockedUntil = now + 500;
      }
    };

    const handleTouchMove = (e) => {
      const currentTouches = Array.from(e.touches);
      const startPositions = touchStateRef.current.touchStartPositions;

      for (const touch of currentTouches) {
        const startPos = startPositions.find(pos => pos.identifier === touch.identifier);
        if (startPos) {
          const dx = touch.clientX - startPos.x;
          const dy = touch.clientY - startPos.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > 10) {
            touchStateRef.current.hasMoved = true;
            break;
          }
        }
      }

      if (e.touches.length > 1) {
        touchStateRef.current.isMultiTouch = true;
        setIsMultiTouch(true);
        const now = Date.now();
        touchStateRef.current.clickBlockedUntil = now + 1000;
      } else if (touchStateRef.current.hasMoved) {
        const now = Date.now();
        touchStateRef.current.clickBlockedUntil = now + 500;
      }
    };

    const handleTouchEnd = (e) => {
      const now = Date.now();

      if (e.touches.length > 0) {
        touchStateRef.current.touchCount = e.touches.length;
        return;
      }

      touchStateRef.current.lastTouchEnd = now;

      let blockDuration = 500;
      if (touchStateRef.current.isMultiTouch) {
        blockDuration = 1000;
      } else if (touchStateRef.current.hasMoved) {
        blockDuration = 500;
      } else {
        blockDuration = 500;
      }

      touchStateRef.current.clickBlockedUntil = now + blockDuration;

      setTimeout(() => {
        touchStateRef.current.isMultiTouch = false;
        setIsMultiTouch(false);
        touchStateRef.current.touchCount = 0;
        touchStateRef.current.hasMoved = false;
        touchStateRef.current.touchStartPositions = [];
      }, blockDuration);
    };

    const handleTouchCancel = () => {
      const now = Date.now();
      touchStateRef.current.isMultiTouch = false;
      setIsMultiTouch(false);
      touchStateRef.current.touchCount = 0;
      touchStateRef.current.hasMoved = false;
      touchStateRef.current.touchStartPositions = [];
      touchStateRef.current.clickBlockedUntil = now + 500;
    };

    const handleClickCapture = (e) => {
      // Allow input fields to receive focus and show keyboard
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || 
          target.closest('input') || target.closest('textarea'))) {
        return; // Don't interfere with input fields
      }

      const now = Date.now();
      const timeSinceLastTouch = now - touchStateRef.current.lastTouchEnd;
      const isBlocked = now < touchStateRef.current.clickBlockedUntil;

      const isTouchClick = e.pointerType === 'touch' ||
                          e.type === 'touchend' ||
                          timeSinceLastTouch < 1000 ||
                          isBlocked;

      if (isTouchClick || touchStateRef.current.isMultiTouch || isBlocked) {
        const directionsContainer = mapContainer.querySelector('.mapbox-directions-component');
        if (directionsContainer && !target.closest('.mapbox-directions-component input')) {
          e.stopPropagation();
          e.stopImmediatePropagation();
        }
      }
    };

    // Store handlers for cleanup
    touchHandlersRef.current = {
      handleTouchStart,
      handleTouchMove,
      handleTouchEnd,
      handleTouchCancel,
      handleClickCapture
    };

    // Add touch event listeners
    mapContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
    mapContainer.addEventListener('touchmove', handleTouchMove, { passive: true });
    mapContainer.addEventListener('touchend', handleTouchEnd, { passive: true });
    mapContainer.addEventListener('touchcancel', handleTouchCancel, { passive: true });
    mapContainer.addEventListener('click', handleClickCapture, true);

    // Override map click handler
    mapRef.current.on('click', (e) => {
      const now = Date.now();
      const timeSinceLastTouch = now - touchStateRef.current.lastTouchEnd;
      const isBlocked = now < touchStateRef.current.clickBlockedUntil;

      const isTouchClick = e.originalEvent?.pointerType === 'touch' ||
                          e.originalEvent?.type === 'touchend' ||
                          timeSinceLastTouch < 1000 ||
                          isBlocked;

      if (isTouchClick || touchStateRef.current.isMultiTouch || isBlocked) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    });

    return touchHandlersRef.current;
  }, [mapRef, setIsMultiTouch]);

  const cleanupTouchHandlers = useCallback(() => {
    if (!mapRef.current || !touchHandlersRef.current) return;

    const mapContainer = mapRef.current.getContainer();
    if (mapContainer) {
      mapContainer.removeEventListener('touchstart', touchHandlersRef.current.handleTouchStart);
      mapContainer.removeEventListener('touchmove', touchHandlersRef.current.handleTouchMove);
      mapContainer.removeEventListener('touchend', touchHandlersRef.current.handleTouchEnd);
      mapContainer.removeEventListener('touchcancel', touchHandlersRef.current.handleTouchCancel);

      if (touchHandlersRef.current.handleClickCapture) {
        mapContainer.removeEventListener('click', touchHandlersRef.current.handleClickCapture, true);
      }
    }
  }, [mapRef]);

  return {
    touchStateRef,
    setupTouchHandlers,
    cleanupTouchHandlers
  };
};

