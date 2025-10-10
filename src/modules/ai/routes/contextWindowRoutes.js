'use strict';

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = (logger) => {

    // GET /api/context-window - Get all context window configs
    router.get('/', async (req, res) => {
        try {
            const configs = await prisma.contextWindow.findMany();
            res.json({ success: true, data: configs });
        } catch (error) {
            logger.error('Error fetching context window configs:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // POST /api/context-window - Create a new context window config
    router.post('/', async (req, res) => {
        try {
            const { name, system_prompt, use_product_rag, use_knowledge_rag, max_context_messages, include_user_history, temperature, text_model_name, max_tokens, image_model_name, image_prompt, text_api_key, image_api_key } = req.body;
            if (!name) {
                return res.status(400).json({ success: false, error: 'Name is a required field.' });
            }
            const newConfig = await prisma.contextWindow.create({
                data: {
                    name,
                    system_prompt,
                    use_product_rag,
                    use_knowledge_rag,
                    max_context_messages,
                    include_user_history,
                    temperature,
                    text_model_name,
                    max_tokens,
                    image_model_name,
                    image_prompt,
                    text_api_key,
                    image_api_key
                }
            });
            res.status(201).json({ success: true, data: newConfig });
        } catch (error) {
            logger.error('Error creating context window config:', error);
            if (error.code === 'P2002') { // Unique constraint violation
                return res.status(409).json({ success: false, error: `A configuration with the name '${req.body.name}' already exists.` });
            }
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/context-window/:id - Get a single context window config
    router.get('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const config = await prisma.contextWindow.findUnique({ where: { id } });
            if (!config) {
                return res.status(404).json({ success: false, error: 'Configuration not found.' });
            }
            res.json({ success: true, data: config });
        } catch (error) {
            logger.error(`Error fetching context window config ${req.params.id}:`, error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // PUT /api/context-window/:id - Update a context window config
    router.put('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const { name, system_prompt, use_product_rag, use_knowledge_rag, max_context_messages, include_user_history, temperature, text_model_name, max_tokens, image_model_name, image_prompt, text_api_key, image_api_key } = req.body;
            
            const updatedConfig = await prisma.contextWindow.update({
                where: { id },
                data: {
                    name,
                    system_prompt,
                    use_product_rag,
                    use_knowledge_rag,
                    max_context_messages,
                    include_user_history,
                    temperature,
                    text_model_name,
                    max_tokens,
                    image_model_name,
                    image_prompt,
                    text_api_key,
                    image_api_key
                }
            });
            res.json({ success: true, data: updatedConfig });
        } catch (error) {
            logger.error(`Error updating context window config ${req.params.id}:`, error);
            if (error.code === 'P2002') { // Unique constraint violation
                return res.status(409).json({ success: false, error: `A configuration with the name '${req.body.name}' already exists.` });
            }
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // DELETE /api/context-window/:id - Delete a context window config
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            await prisma.contextWindow.delete({ where: { id } });
            res.status(204).send();
        } catch (error) {
            logger.error(`Error deleting context window config ${req.params.id}:`, error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return router;
};