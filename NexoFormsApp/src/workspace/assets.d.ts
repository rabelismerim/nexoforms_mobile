declare module '*.svg' {
  import React from 'react';
  import { SvgProps } from 'react-native-svg';
  const component: React.FC<SvgProps>;
  export default component;
}
