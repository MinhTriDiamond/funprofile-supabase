/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="vi" dir="ltr">
    <Head />
    <Preview>Mã xác thực FUN ID của bạn</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>✦ FUN Ecosystem ✦</Text>
        <Hr style={goldLine} />
        <Heading style={h1}>Xác thực danh tính 🔐</Heading>
        <Text style={text}>Sử dụng mã bên dưới để xác nhận danh tính của bạn:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Hr style={goldLine} />
        <Text style={footer}>
          Mã này sẽ hết hạn trong thời gian ngắn. Nếu bạn không yêu cầu mã này, hãy bỏ qua email này nhé. 💖
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
}
const container = { padding: '32px 28px', maxWidth: '480px', margin: '0 auto' }
const brand = {
  fontSize: '14px',
  fontWeight: 'bold' as const,
  color: '#C9A84C',
  textAlign: 'center' as const,
  letterSpacing: '2px',
  margin: '0 0 16px',
}
const goldLine = { borderColor: 'rgba(201, 168, 76, 0.4)', margin: '16px 0' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#166534',
  margin: '20px 0 16px',
}
const text = {
  fontSize: '14px',
  color: '#3d5a3d',
  lineHeight: '1.6',
  margin: '0 0 24px',
}
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#166534',
  margin: '0 0 24px',
  letterSpacing: '4px',
  textAlign: 'center' as const,
  padding: '16px',
  backgroundColor: 'rgba(22, 101, 52, 0.05)',
  borderRadius: '8px',
  border: '1px solid rgba(201, 168, 76, 0.3)',
}
const footer = { fontSize: '12px', color: '#999999', margin: '24px 0 0' }
