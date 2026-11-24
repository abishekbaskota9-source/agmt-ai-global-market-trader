import "./globals.css";
export const viewport={width:"device-width",initialScale:1,maximumScale:1,userScalable:false,viewportFit:"cover"};
export const metadata={title:"AGMT XAUUSD Live Terminal",description:"XAUUSD live market prices and candlestick charts"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
