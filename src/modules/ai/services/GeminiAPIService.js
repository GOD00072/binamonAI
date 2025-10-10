'use strict';

const axios = require('axios');

class GeminiAPIService {
    constructor(logger) {
        this.logger = logger;
    }

    async callGeminiAPI(prompt, history = [], generationConfig, apiKey, modelName = 'gemini-2.5-pro') {
        try {
            if (!apiKey) {
                throw new Error('GEMINI_API_KEY not provided to GeminiAPIService');
            }

            const apiEndpoint = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent`;
            
            const payload = {
                contents: [],
                generationConfig: generationConfig
            };

            if (history && history.length > 0) {
                payload.contents = [...history];
            }
            payload.contents.push({ role: 'user', parts: [{ text: prompt }] });

            this.logger.info('Sending direct API request to Gemini v1 endpoint via GeminiAPIService', {
                endpointUrl: apiEndpoint,
                promptLength: prompt.length,
                historyLength: history.length,
                payloadSize: JSON.stringify(payload).length
            });

            const response = await axios.post(
                `${apiEndpoint}?key=${apiKey}`,
                payload,
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 60000 // 60 second timeout
                }
            );

            this.logger.info('Received response from Gemini API via GeminiAPIService', {
                status: response.status,
                hasData: !!response.data,
            });

            if (!response.data || !response.data.candidates || !Array.isArray(response.data.candidates) || response.data.candidates.length === 0) {
                this.logger.error('Invalid response structure from Gemini API in GeminiAPIService', {
                    responseDataPreview: JSON.stringify(response.data).substring(0, 500)
                });
                throw new Error('Invalid candidates array in Gemini API response');
            }
            
            const firstCandidate = response.data.candidates[0];
            if (!firstCandidate.content || !firstCandidate.content.parts || !firstCandidate.content.parts[0] || typeof firstCandidate.content.parts[0].text !== 'string') {
                this.logger.error('Invalid candidate content structure from Gemini API in GeminiAPIService', {
                    candidateDataPreview: JSON.stringify(firstCandidate).substring(0, 500)
                });
                throw new Error('Invalid content structure in Gemini API response candidate');
            }

            const responseText = firstCandidate.content.parts[0].text;
            
            // Estimate tokens if not present, or use provided metadata
            const promptTokenCount = response.data.usageMetadata?.promptTokenCount;
            const candidatesTokenCount = response.data.usageMetadata?.candidatesTokenCount;


            return {
                response: {
                    text: () => responseText, // Keep the text() method for compatibility
                    usageMetadata: {
                        promptTokenCount: promptTokenCount, // May be undefined
                        candidatesTokenCount: candidatesTokenCount // May be undefined
                    }
                }
            };

        } catch (error) {
            if (error.response) {
                this.logger.error('Error calling Gemini API (server response) in GeminiAPIService:', {
                    status: error.response.status,
                    data: error.response.data,
                });
            } else if (error.request) {
                this.logger.error('Error calling Gemini API (no response) in GeminiAPIService:', {
                    requestDetails: error.request._currentUrl || error.request.path,
                    isTimeout: error.code === 'ECONNABORTED'
                });
            } else {
                this.logger.error('Error setting up/calling Gemini API request in GeminiAPIService:', {
                    message: error.message,
                    stack: error.stack
                });
            }
            throw error; // Re-throw for the main class to handle (e.g., fallback model)
        }
    }
}

module.exports = GeminiAPIService;
