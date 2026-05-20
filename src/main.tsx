import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#0c0c0c',
          colorText: 'rgba(13, 13, 13, 0.95)',
          colorTextSecondary: 'rgba(13, 13, 13, 0.55)',
          colorBgLayout: '#f6f6f6',
          colorBorder: '#e5e7eb',
          borderRadius: 10,
          fontFamily:
            '"IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);

