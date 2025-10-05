declare module 'react-plotly.js/factory' {
  import { Component } from 'react';
  import Plotly from 'plotly.js';

  export default function PlotlyFactory(Plotly: any): any;
}

declare module 'plotly.js-dist-min' {
  const Plotly: any;
  export default Plotly;
}
