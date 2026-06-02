import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines class names using clsx and tailwind-merge.
 * This ensures Tailwind classes are properly merged without conflicts.
 * @param {...(string | undefined | null | false)} inputs - Class names to merge
 * @returns {string} Merged class names
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

/**
 * Escape a string for safe insertion into innerHTML.
 *
 * Any field sourced from crowd-sourced or third-party data (OSM tags,
 * Mangrove review text, …) must be passed through this function before
 * being interpolated into an HTML template string.
 *
 * @param {*} str - Value to escape. null/undefined are returned as ''.
 * @returns {string} HTML-safe string.
 */
export function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Debounce function execution.
 * @param {Function} fn - Function to debounce
 * @param {number} ms - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, ms = 300) {
    let timeoutId;
    const debounced = function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), ms);
    };
    debounced.cancel = () => clearTimeout(timeoutId);
    return debounced;
}

/**
 * Format a number as a distance (e.g., "150 m" or "1.2 km").
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance
 */
export function formatDistance(meters) {
    if (meters < 1000) {
        return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
}
