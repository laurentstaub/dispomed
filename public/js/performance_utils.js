/**
 * Performance utilities for caching and memoization
 */

/**
 * Creates a memoized version of a function with optional TTL (time to live)
 * @param {Function} fn - The function to memoize
 * @param {Object} options - Configuration options
 * @param {Function} options.keyGenerator - Function to generate cache key from arguments
 * @param {number} options.ttl - Time to live in milliseconds (optional)
 * @returns {Function} Memoized function
 */
export function memoize(fn, options = {}) {
  const cache = new Map();
  const { keyGenerator = JSON.stringify, ttl = null } = options;
  
  return function(...args) {
    const key = keyGenerator(args);
    
    if (cache.has(key)) {
      const cached = cache.get(key);
      if (!ttl || Date.now() - cached.timestamp < ttl) {
        return cached.value;
      }
    }
    
    const result = fn.apply(this, args);
    cache.set(key, { value: result, timestamp: Date.now() });
    
    // Limit cache size to prevent memory leaks
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    
    return result;
  };
}

/**
 * Debounce function with leading and trailing options
 * @param {Function} func - The function to debounce
 * @param {number} wait - The debounce delay in milliseconds
 * @param {Object} options - Configuration options
 * @param {boolean} options.leading - Execute on the leading edge
 * @param {boolean} options.trailing - Execute on the trailing edge
 * @returns {Function} Debounced function
 */
export function debounce(func, wait, options = {}) {
  let timeout;
  let lastArgs;
  let lastThis;
  let result;
  let lastCallTime;
  let lastInvokeTime = 0;
  let leading = options.leading || false;
  let trailing = options.trailing !== false;
  
  function invokeFunc(time) {
    const args = lastArgs;
    const thisArg = lastThis;
    
    lastArgs = lastThis = undefined;
    lastInvokeTime = time;
    result = func.apply(thisArg, args);
    return result;
  }
  
  function leadingEdge(time) {
    lastInvokeTime = time;
    timeout = setTimeout(timerExpired, wait);
    return leading ? invokeFunc(time) : result;
  }
  
  function timerExpired() {
    const time = Date.now();
    if (shouldInvoke(time)) {
      return trailingEdge(time);
    }
    timeout = setTimeout(timerExpired, remainingWait(time));
  }
  
  function trailingEdge(time) {
    timeout = undefined;
    if (trailing && lastArgs) {
      return invokeFunc(time);
    }
    lastArgs = lastThis = undefined;
    return result;
  }
  
  function shouldInvoke(time) {
    const timeSinceLastCall = time - lastCallTime;
    const timeSinceLastInvoke = time - lastInvokeTime;
    
    return lastCallTime === undefined || 
           timeSinceLastCall >= wait ||
           timeSinceLastCall < 0;
  }
  
  function remainingWait(time) {
    const timeSinceLastCall = time - lastCallTime;
    const timeWaiting = wait - timeSinceLastCall;
    return timeWaiting;
  }
  
  function debounced(...args) {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);
    
    lastArgs = args;
    lastThis = this;
    lastCallTime = time;
    
    if (isInvoking) {
      if (timeout === undefined) {
        return leadingEdge(lastCallTime);
      }
    }
    
    if (timeout === undefined) {
      timeout = setTimeout(timerExpired, wait);
    }
    
    return result;
  }
  
  debounced.cancel = function() {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    lastInvokeTime = 0;
    lastArgs = lastCallTime = lastThis = timeout = undefined;
  };
  
  debounced.flush = function() {
    return timeout === undefined ? result : trailingEdge(Date.now());
  };
  
  return debounced;
}

/**
 * Throttle function execution
 * @param {Function} func - The function to throttle
 * @param {number} limit - The throttle limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  let lastResult;
  
  return function(...args) {
    if (!inThrottle) {
      lastResult = func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
    return lastResult;
  };
}

/**
 * Request animation frame throttle for smooth animations
 * @param {Function} func - The function to throttle
 * @returns {Function} Throttled function
 */
export function rafThrottle(func) {
  let rafId = null;
  
  return function(...args) {
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    
    rafId = requestAnimationFrame(() => {
      func.apply(this, args);
      rafId = null;
    });
  };
}

/**
 * Efficient array deduplication using Set
 * @param {Array} array - Array to deduplicate
 * @param {Function} keyFn - Optional function to extract comparison key
 * @returns {Array} Deduplicated array
 */
export function deduplicate(array, keyFn = null) {
  if (!keyFn) {
    return [...new Set(array)];
  }
  
  const seen = new Set();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Virtual scrolling helper for large lists
 * @param {Object} config - Configuration object
 * @param {number} config.itemHeight - Height of each item
 * @param {number} config.containerHeight - Height of the visible container
 * @param {number} config.totalItems - Total number of items
 * @param {number} config.scrollTop - Current scroll position
 * @param {number} config.overscan - Number of items to render outside visible area
 * @returns {Object} Visible range and positioning
 */
export function calculateVirtualScrollRange(config) {
  const {
    itemHeight,
    containerHeight,
    totalItems,
    scrollTop,
    overscan = 3
  } = config;
  
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    totalItems - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );
  
  const offsetY = startIndex * itemHeight;
  const visibleItems = endIndex - startIndex + 1;
  
  return {
    startIndex,
    endIndex,
    offsetY,
    visibleItems,
    totalHeight: totalItems * itemHeight
  };
}

/**
 * Performance monitoring helper
 * @param {string} name - Name of the performance mark
 * @returns {Object} Performance measurement utilities
 */
export function createPerformanceMonitor(name) {
  const marks = new Map();
  
  return {
    start(label = 'default') {
      const markName = `${name}-${label}-start`;
      performance.mark(markName);
      marks.set(label, markName);
    },
    
    end(label = 'default') {
      const startMark = marks.get(label);
      if (!startMark) {
        console.warn(`No start mark found for ${label}`);
        return null;
      }
      
      const endMark = `${name}-${label}-end`;
      const measureName = `${name}-${label}`;
      
      performance.mark(endMark);
      performance.measure(measureName, startMark, endMark);
      
      const entries = performance.getEntriesByName(measureName);
      const duration = entries[entries.length - 1]?.duration;
      
      // Clean up
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(measureName);
      marks.delete(label);
      
      return duration;
    },
    
    async measureAsync(fn, label = 'default') {
      this.start(label);
      try {
        const result = await fn();
        return { result, duration: this.end(label) };
      } catch (error) {
        this.end(label);
        throw error;
      }
    },
    
    measure(fn, label = 'default') {
      this.start(label);
      try {
        const result = fn();
        return { result, duration: this.end(label) };
      } catch (error) {
        this.end(label);
        throw error;
      }
    }
  };
}