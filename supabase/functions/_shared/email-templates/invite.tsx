/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="vi" dir="ltr">
    <Head />
    <Preview>Bạn được mời tham gia FUN Ecosystem! 🌟</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>✦ FUN Ecosystem ✦</Text>
        <Hr style={goldLine} />
        <Heading style={h1}>Bạn được mời tham gia! 🎉</Heading>
        <Text style={text}>
          Bạn đã được mời tham gia <strong>FUN Ecosystem</strong>. Nhấn nút bên dưới để chấp nhận lời mời và tạo FUN ID của bạn nhé.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Chấp Nhận Lời Mời 💎
        </Button>
        <Hr style={goldLine} />
        <Text style={footer}>
          Nếu bạn không mong đợi lời mời này, hãy bỏ qua email này nhé. 💖
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

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
const button = {
  backgroundColor: '#166534',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '14px 28px',
  textDecoration: 'none',
  border: '1px solid rgba(201, 168, 76, 0.5)',
  display: 'block' as const,
  textAlign: 'center' as const,
}
const footer = { fontSize: '12px', color: '#999999', margin: '24px 0 0' }
