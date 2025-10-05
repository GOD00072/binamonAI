const express = require('express');

function timeRoutes({ summaryManager, logger }) {
    const router = express.Router();

    router.get('/periods', (req, res) => {
        res.json({
            success: true,
            currentPeriod: TimePeriod.getCurrentPeriod(),
            periods: Object.values(TimePeriod.PERIODS)
        });
    });

    router.get('/current', (req, res) => {
        const currentPeriod = TimePeriod.getCurrentPeriod();
        const { start, end } = TimePeriod.getPeriodTimeRange(currentPeriod);
        res.json({ success: true, period: currentPeriod, timeRange: { start, end } });
    });

    router.post('/generate/:periodName', async (req, res) => {
        const { periodName } = req.params;
        const period = Object.values(TimePeriod.PERIODS).find(p => p.name === periodName);
        if (!period) return res.status(400).json({ success: false, error: 'Invalid period' });
        
        const summary = await summaryManager.generatePeriodSummaries(period);
        res.json({ success: true, summary });
    });

    router.get('/range/:periodName', (req, res) => {
        const { periodName } = req.params;
        const period = Object.values(TimePeriod.PERIODS).find(p => p.name === periodName);
        if (!period) return res.status(400).json({ success: false, error: 'Invalid period' });

        const range = TimePeriod.getPeriodTimeRange(period);
        res.json({ success: true, period, timeRange: range });
    });

    return router;
}

module.exports = timeRoutes;