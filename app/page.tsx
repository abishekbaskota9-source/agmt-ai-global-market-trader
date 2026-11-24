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
 const el=useRef<HTMLDivElement>(null),streamLive=useRef(false),lastBiquoteAt=useRef(0);
 const [tf,setTf]=useState("5m"),[tick,setTick]=useState<Tick|null>(null),[status,setStatus]=useState("LOADING"),[error,setError]=useState(""),[stamp,setStamp]=useState("");

 useEffect(()=>{if(!el.current)return;el.current.innerHTML='<div class="tradingview-widget-container__widget" style="height:calc(100% - 32px);width:100%"></div><div class="tradingview-widget-copyright"><a href="https://www.tradingview.com/symbols/OANDA-XAUUSD/" rel="noopener noreferrer" target="_blank">Gold price chart · TradingView</a></div>';const script=document.createElement("script");script.src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";script.async=true;script.type="text/javascript";script.innerHTML=JSON.stringify({autosize:true,symbol:"OANDA:XAUUSD",interval:tvIntervals[tf],timezone:"Etc/UTC",theme:"dark",style:"1",locale:"en",allow_symbol_change:true,calendar:false,hide_side_toolbar:false,details:true,hotlist:false,withdateranges:true,support_host:"https://www.tradingview.com"});el.current.appendChild(script);return()=>{if(el.current)el.current.innerHTML=""}},[tf]);

 useEffect(()=>{
  let ok=true,conn:any,timer:ReturnType<typeof setInterval>|undefined,spotTimer:ReturnType<typeof setInterval>|undefined;
  const apply=(input:any,source:"stream"|"rest")=>{
   const v=normalizeTick(input);if(!ok||!v||v.symbol!=="XAUUSD")return;
   const bid=Number(v.bid),ask=Number(v.ask),mid=Number(v.mid??(Number.isFinite(bid)&&Number.isFinite(ask)?(bid+ask)/2:v.last));
   if(!Number.isFinite(mid)||mid<=0)return;
   lastBiquoteAt.current=Date.now();setTick({...v,source:"Biquote MT5"});setStamp(new Date().toLocaleTimeString());
   if(source==="stream"){streamLive.current=true;setStatus("LIVE");setError("")}
   else if(!streamLive.current){setStatus(v.stale||v.marketState==="closed"?"LAST QUOTE":"REST DATA");setError("")}
  };
  const getSnapshot=async()=>{
   try{const r=await fetch("https://biquote.io/api/XAUUSD",{cache:"no-store"});if(!r.ok)throw Error("Quote HTTP "+r.status);const data=await r.json();apply(data,"rest")}
   catch(e){if(ok&&!streamLive.current&&Date.now()-lastBiquoteAt.current>30000){setStatus("FALLBACK CHECK");setError("Biquote REST unavailable; checking independent spot reference.")}}
  };
  const getSpotFallback=async()=>{
   if(!ok||streamLive.current||Date.now()-lastBiquoteAt.current<30000)return;
   try{
    const r=await fetch("https://xaus.com/api/v1/spot",{cache:"no-store"});
    if(!r.ok)throw Error("XAUS HTTP "+r.status);
    const d=await r.json(),price=Number(d.spot_usd_oz??d.xau?.price),age=Number(d.data_state?.age_seconds??0);
    if(!Number.isFinite(price)||price<=0)throw Error("XAUS response has no valid spot price");
    if(!ok||streamLive.current||Date.now()-lastBiquoteAt.current<30000)return;
    setTick({symbol:"XAUUSD",mid:price,timestamp:d.data_state?.as_of??d.updated_at,source:"XAUS indicative spot",marketState:"INDICATIVE SPOT",stale:age>120,quoteAgeSeconds:age});
    setStamp(new Date().toLocaleTimeString());setStatus(age>120?"STALE SPOT":"SPOT REFERENCE");setError("");
   }catch(e){if(ok&&!streamLive.current&&Date.now()-lastBiquoteAt.current>30000){setStatus("NO LIVE QUOTE");setError("Biquote and XAUS spot fallback unavailable: "+String(e))}}
  };
  getSnapshot();timer=setInterval(getSnapshot,5000);getSpotFallback();spotTimer=setInterval(getSpotFallback,60000);
  (async()=>{try{
   conn=new HubConnectionBuilder().withUrl("https://biquote.io/hubs/tick").withAutomaticReconnect().configureLogging(LogLevel.Warning).build();
   conn.on("ReceiveTick",(payload:any)=>apply(payload,"stream"));
   conn.onreconnecting(()=>{streamLive.current=false;if(ok)setStatus("RECONNECTING")});
   conn.onreconnected(async()=>{try{await conn.invoke("Subscribe",["XAUUSD"]);if(ok&&!streamLive.current)setStatus("CONNECTED · WAITING TICK")}catch(e){if(ok)setError("Resubscribe failed: "+String(e))}});
   await conn.start();await conn.invoke("Subscribe",["XAUUSD"]);if(ok&&!streamLive.current)setStatus("CONNECTED · WAITING TICK");
  }catch(e){if(ok&&!streamLive.current){setStatus("REST FALLBACK");setError("SignalR unavailable; REST and spot fallback active: "+String(e))}}})();
  return()=>{ok=false;if(timer)clearInterval(timer);if(spotTimer)clearInterval(spotTimer);if(conn)conn.stop()};
 },[]);

 const raw=tick?.mid??(tick?.bid!=null&&tick?.ask!=null?(Number(tick.bid)+Number(tick.ask))/2:tick?.last),price=Number(raw);
 const hasBidAsk=tick?.bid!=null&&tick?.ask!=null;
 return <main><header><div><div className="brand">AGMT <span>GLOBAL MARKET TRADER</span></div><div className="sub">GOLD / US DOLLAR · MARKET TERMINAL</div></div><div className={"status "+(status==="LIVE"?"live":"")}>● {status}</div></header><section className="quote"><div><div className="label">XAUUSD · SPOT GOLD</div><div className="price">{Number.isFinite(price)&&price>0?price.toFixed(2):"—"} <small>USD</small></div><div className="muted">{tick?.source||"Waiting for market data"} · {stamp||"Waiting for quote"} · {tick?.marketState||"state pending"} {tick?.stale?"· STALE":""}{tick?.quoteAgeSeconds!=null?" · "+tick.quoteAgeSeconds+"s old":""}</div></div><div className="quotes"><div><span>BID</span><b>{hasBidAsk?Number(tick!.bid).toFixed(2):"N/A"}</b></div><div><span>ASK</span><b>{hasBidAsk?Number(tick!.ask).toFixed(2):"N/A"}</b></div></div></section><section className="panel"><div className="toolbar"><b>LIVE CANDLESTICK CHART</b><div className="tabs">{tfs.map(x=><button key={x} className={tf===x?"active":""} onClick={()=>setTf(x)}>{x.toUpperCase()}</button>)}</div></div><div ref={el} className="chart tradingview-widget-container"/><div className="legend">TradingView-hosted OANDA:XAUUSD chart · Chart feed is separate from AGMT quote feed.</div></section><section className="panel note"><b>MARKET DATA SOURCE & LIMITATIONS</b><p>Biquote MT5 is the preferred live tick source for BID/ASK. If unavailable, XAUS supplies an indicative XAU/USD spot midpoint refreshed about every 60 seconds; that fallback is not a broker execution quote and does not provide BID/ASK. TradingView chart data is separate. No broker orders or real-money execution are enabled.</p>{error&&<small>{error}</small>}</section><footer>AGMT · XAUUSD · Status reflects data actually received, not connection alone.</footer></main>
}
