'use strict';

/**
 * KnowledgeFormatter - Simple knowledge formatting service
 * Formats knowledge search results for display
 */
class KnowledgeFormatter {
    constructor(logger) {
        this.logger = logger;
        this.config = {
            maxPreviewLength: 300000,
            includeSource: true,
            includeConfidence: true,
            groupByCategory: true
        };
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return this.config;
    }

    /**
     * Format knowledge search results
     */
    formatKnowledgeList(results) {
        if (!results || results.length === 0) {
            return [];
        }

        return results.map((result, index) => ({
            id: result.id || `knowledge-${index}`,
            content: result.content || result.text || '',
            category: result.category || result.metadata?.category || 'general',
            file_name: result.file_name || result.metadata?.file_name || 'unknown',
            relevance_score: result.relevance_score || result.score || 0,
            source: result.source || result.metadata?.source || '',
            metadata: result.metadata || {}
        }));
    }

    /**
     * Format single knowledge item
     */
    formatKnowledgeItem(item) {
        if (!item) return null;

        return {
            id: item.id || 'unknown',
            content: item.content || item.text || '',
            category: item.category || item.metadata?.category || 'general',
            file_name: item.file_name || item.metadata?.file_name || 'unknown',
            relevance_score: item.relevance_score || item.score || 0,
            source: item.source || item.metadata?.source || '',
            metadata: item.metadata || {}
        };
    }

    /**
     * Format knowledge for context
     */
    formatForContext(results, language = 'TH') {
        if (!results || results.length === 0) {
            return '';
        }

        const formattedResults = this.formatKnowledgeList(results);

        let context = '';
        formattedResults.forEach((result, index) => {
            context += `\n[${index + 1}] ${result.content}`;
            if (this.config.includeSource && result.file_name) {
                context += ` (${result.file_name})`;
            }
            if (this.config.includeConfidence && result.relevance_score) {
                context += ` [${(result.relevance_score * 100).toFixed(1)}%]`;
            }
        });

        return context;
    }
}

module.exports = KnowledgeFormatter;
