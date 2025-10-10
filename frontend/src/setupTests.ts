// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock plotly.js to prevent canvas errors in JSDOM environment
jest.mock('plotly.js-dist-min', () => ({}));

// Mock react-markdown and its dependencies to prevent ESM errors in Jest
jest.mock('react-markdown', () => (props) => {
    const React = require('react');
    return React.createElement('div', props, props.children);
});
jest.mock('remark-gfm', () => ({}));
jest.mock('react-syntax-highlighter', () => ({
    Prism: (props) => {
        const React = require('react');
        return React.createElement('code', props, props.children);
    },
}));