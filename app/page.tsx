"use client";
import {useEffect,useRef,useState} from "react";
import {HubConnectionBuilder,LogLevel} from "@microsoft/signalr";

type Tick={symbol?:string;bid?:number;ask?:number;mid?:number;last?:number;timestamp?:string;time?:string;marketState?:string;stale?:boolean;quoteAgeSeconds?:number;source?:string};
const tfs=["1m","5m","15m","30m","1h","4h","1d"],tvIntervals:Record<string,string>={"1m":"1","5m":"5","15m":"15","30m":"30","1h":"60","4h":"240","1d":"D"};

function normalizeTick(input:any):Tick|null {
  const v=Array.isArray(input)?input[0]:input?.tick??input;
  if(!v||typeof v!=="object")return null;
  return {...v,symbol:String(v.symbol??"XAUUSD").toUpperCase()};
}

export default function Home(){
 const el=useRef<HTMLDivElement>(null),streamLive=useRef(false);
 const [tf,setTf]=useState("5m"),[tick,setTick]=useState<Tick|null>(null),[status,setStatus]=useState("LOADING"),[error,setError]=useState(""),[stamp,setStamp]=useState("");

 useEffect(()=>{if(!el.current)return;el.current.innerHTML='<div class="tradingview-widget-container__widget" style="height:calc(100% - 32px);width:100%"></div><div class="tradingview-widget-copyright"><a href="https://www.tradingview.com/symbols/OANDA-XAUUSD/" rel="noopener noreferrer" target="_blank">Gold price chart · TradingView</a></div>';const script=document.createElement("script");script.src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";script.async=true;script.type="text/javascript";script.innerHTML=JSON.stringify({autosize:true,symbol:"OANDA:XAUUSD",interval:tvIntervals[tf],timezone:"Etc/UTC",theme:"dark",style:"1",locale:"en",allow_symbol_change:true,calendar:false,hide_side_toolbar:false,details:true,hotlist:false,withdateranges:true,support_host:"https://www.tradingview.com"});el.current.appendChild(script);return()=>{if(el.current)el.current.innerHTML=""}},[tf]);

 useEffect(()=>{
  let ok=true,conn:any,timer:ReturnType<typeof setInterval>|undefined;
  const apply=(input:any,source:"stream"|"rest")=>{
   const v=normalizeTick(input);if(!ok||!v||v.symbol!=="XAUUSD")return;
   const bid=Number(v.bid),ask=Number(v.ask),mid=Number(v.mid??(Number.isFinite(bid)&&Number.isFinite(ask)?(bid+ask)/2:v.last));
   if(!Number.isFinite(mid)||mid<=0)return;
   setTick(v);setStamp(new Date().toLocaleTimeString());
   if(source==="stream"){streamLive.current=true;setStatus("LIVE");setError("")}
   else if(!streamLive.current)setStatus(v.stale||v.marketState==="closed"?"LAST QUOTE":"REST DATA");
  };
  const getSnapshot=async()=>{
   try{const r=await fetch("https://biquote.io/api/XAUUSD",{cache:"no-store"});if(!r.ok)throw Error("Quote HTTP "+r.status);const data=await r.json();apply(data,"rest")}
   catch(e){if(ok&&!streamLive.current){setStatus("NO DATA");setError("XAUUSD REST quote failed: "+String(e))}}
  };
  getSnapshot();timer=setInterval(getSnapshot,1000);
  (async()=>{try{
   conn=new HubConnectionBuilder().withUrl("https://biquote.io/hubs/tick").withAutomaticReconnect().configureLogging(LogLevel.Warning).build();
   conn.on("ReceiveTick",(payload:any)=>apply(payload,"stream"));
   conn.onreconnecting(()=>{streamLive.current=false;if(ok)setStatus("RECONNECTING")});
   conn.onreconnected(async()=>{try{await conn.invoke("Subscribe",["XAUUSD"]);if(ok&&!streamLive.current)setStatus("CONNECTED · WAITING TICK")}catch(e){if(ok)setError("Resubscribe failed: "+String(e))}});
   await conn.start();await conn.invoke("Subscribe",["XAUUSD"]);if(ok&&!streamLive.current)setStatus("CONNECTED · WAITING TICK");
  }catch(e){if(ok&&!streamLive.current){setStatus("REST FALLBACK");setError("SignalR unavailable; REST fallback active: "+String(e))}}})();
  return()=>{ok=false;if(timer)clearInterval(timer);if(conn)conn.stop()};
 },[]);

 const raw=tick?.mid??(tick?.bid!=null&&tick?.ask!=null?(Number(tick.bid)+Number(tick.ask))/2:tick?.last),price=Number(raw);
 return <main><header><div><div className="brand">AGMT <span>GLOBAL MARKET TRADER</span></div><div className="sub">GOLD / US DOLLAR · MARKET TERMINAL</div></div><div className={"status "+(status==="LIVE"?"live":"")}>● {status}</div></header><section className="quote"><div><div className="label">XAUUSD · SPOT GOLD</div><div className="price">{Number.isFinite(price)&&price>0?price.toFixed(2):"—"} <small>USD</small></div><div className="muted">Biquote MT5 feed · {stamp||"Waiting for quote"} · {tick?.marketState||"state pending"} {tick?.stale?"· STALE":""}{tick?.quoteAgeSeconds!=null?" · "+tick.quoteAgeSeconds+"s old":""}</div></div><div className="quotes"><div><span>BID</span><b>{tick?.bid!=null?Number(tick.bid).toFixed(2):"—"}</b></div><div><span>ASK</span><b>{tick?.ask!=null?Number(tick.ask).toFixed(2):"—"}</b></div></div></section><section className="panel"><div className="toolbar"><b>LIVE CANDLESTICK CHART</b><div className="tabs">{tfs.map(x=><button key={x} className={tf===x?"active":""} onClick={()=>setTf(x)}>{x.toUpperCase()}</button>)}</div></div><div ref={el} className="chart tradingview-widget-container"/><div className="legend">TradingView-hosted OANDA:XAUUSD chart · Chart feed is separate from AGMT BID/ASK quote feed.</div></section><section className="panel note"><b>TRADINGVIEW CHART · SEPARATE QUOTE FEED</b><p>TradingView chart is embedded from OANDA:XAUUSD. It does not provide a public API for AGMT BID/ASK values. Quote panel still requires a working authorized market-data feed. No real broker orders or real-money execution are enabled.</p>{error&&<small>{error}</small>}</section><footer>AGMT · XAUUSD · Feed status reflects received provider data, not connection alone.</footer></main>
}
