import ReactDOM from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import { BridgeProvider } from './context/BridgeContext'
import App from './App'
import './styles/terminal.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <BridgeProvider>
      <App />
    </BridgeProvider>
  </AuthProvider>
)
