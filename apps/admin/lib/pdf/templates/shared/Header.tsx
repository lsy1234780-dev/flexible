import React from 'react';
import { View, Text, StyleSheet } from '@react-pdf/renderer';
import { IssuerInfo } from '../../types';

interface Props {
  issuer: IssuerInfo;
}

const Header: React.FC<Props> = ({ issuer }) => (
  <View style={styles.container}>
    <View style={styles.left}>
      <Text style={styles.companyName}>{issuer.name}</Text>
      {issuer.businessNumber && (
        <Text style={styles.detail}>사업자등록번호: {issuer.businessNumber}</Text>
      )}
      {issuer.ceo && <Text style={styles.detail}>대표자: {issuer.ceo}</Text>}
      {issuer.address && <Text style={styles.detail}>{issuer.address}</Text>}
      {issuer.phone && <Text style={styles.detail}>TEL: {issuer.phone}</Text>}
      {issuer.email && <Text style={styles.detail}>EMAIL: {issuer.email}</Text>}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#1a3a5c',
  },
  left: {
    flexDirection: 'column',
  },
  companyName: {
    fontFamily: 'NotoSansKR',
    fontWeight: 'bold',
    fontSize: 13,
    color: '#1a3a5c',
    marginBottom: 3,
  },
  detail: {
    fontFamily: 'NotoSansKR',
    fontSize: 8,
    color: '#666666',
    marginBottom: 2,
  },
});

export default Header;
