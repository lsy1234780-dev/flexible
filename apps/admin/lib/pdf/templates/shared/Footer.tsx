import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';

const Footer: React.FC = () => (
  <View style={styles.container} fixed>
    <View style={styles.divider} />
    <Text
      style={styles.pageNumber}
      render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    alignItems: 'center',
  },
  divider: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#cccccc',
    marginBottom: 6,
  },
  pageNumber: {
    fontFamily: 'NotoSansKR',
    fontSize: 8,
    color: '#aaaaaa',
    textAlign: 'center',
  },
});

export default Footer;
