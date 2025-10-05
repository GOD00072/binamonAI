const winston = require('winston');
// Create a logger for content cleaning
const cleanerLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...rest }) => {
            const extras = Object.keys(rest).length ? JSON.stringify(rest) : '';
            return `${timestamp} ${level.toUpperCase()}: ${message} ${extras}`;
        })
    ),
    transports: [
        new winston.transports.File({ 
            filename: 'logs/content-cleaner.log', 
            level: 'info'
        })
    ]
});

class MessageContentCleaner {
    /**
     * Remove asterisk characters from text
     * @param {string} text - The input text to process
     * @returns {string} Text with asterisks removed
     */
    static removeAsterisks(text) {
        cleanerLogger.info('Starting asterisk removal', { 
            inputLength: text ? text.length : 0 
        });
        
        if (!text) {
            cleanerLogger.warn('Empty text provided for asterisk removal');
            return text;
        }
        
        // Count asterisks before removal
        const asteriskCount = (text.match(/\*/g) || []).length;
        
        // Remove all asterisk characters
        const result = text.replace(/\*/g, '');
        
        cleanerLogger.info('Asterisk removal completed', {
            inputLength: text.length,
            outputLength: result.length,
            asterisksRemoved: asteriskCount
        });
        
        return result;
    }

    /**
     * Convert markdown links to simple URLs AND remove asterisks
     * @param {string} text - The input text to process
     * @returns {string} Processed text with simplified URLs and no asterisks
     */
    static processUrls(text) {
        // Log the initial input
        cleanerLogger.info('Starting URL processing with asterisk removal', { 
            inputLength: text ? text.length : 0 
        });
        
        if (!text) {
            cleanerLogger.warn('Empty text provided');
            return text;
        }
        
        // Step 1: Remove asterisks first
        let result = this.removeAsterisks(text);
        
        // Step 2: Process markdown links - Regex to match markdown-style links and extract the URL
        const urlRegex = /\[([^\]]*?)\]\(([^)]+)\)/g;
        result = result.replace(urlRegex, '$2');
        
        // Log final result
        cleanerLogger.info('URL processing with asterisk removal completed', {
            inputLength: text.length,
            outputLength: result.length,
            processedAsterisks: true,
            processedUrls: true
        });
        
        return result;
    }

    /**
     * Process text by removing asterisks and converting URLs
     * @param {string} text - The input text to process
     * @returns {string} Fully processed text
     */
    static processContent(text) {
        cleanerLogger.info('Starting complete content processing', { 
            inputLength: text ? text.length : 0 
        });
        
        if (!text) {
            cleanerLogger.warn('Empty text provided for content processing');
            return text;
        }
        
        // Use processUrls which now includes asterisk removal
        const result = this.processUrls(text);
        
        cleanerLogger.info('Complete content processing finished', {
            inputLength: text.length,
            outputLength: result.length
        });
        
        return result;
    }

    /**
     * Clean text by removing asterisks only (no URL processing)
     * @param {string} text - The input text to process
     * @returns {string} Text with asterisks removed
     */
    static cleanText(text) {
        return this.removeAsterisks(text);
    }

    // Alias for backwards compatibility - now includes asterisk removal
    static deduplicateContent(text) {
        cleanerLogger.info('deduplicateContent called - redirecting to processUrls with asterisk removal');
        return this.processUrls(text);
    }
}

module.exports = MessageContentCleaner;