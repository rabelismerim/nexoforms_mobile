import React from 'react';
import {View} from 'react-native';
export const SafeAreaProvider = ({children}: {children: React.ReactNode}) => <View style={{flex: 1, height: '100%'}}>{children}</View>;
export const SafeAreaView = View;
