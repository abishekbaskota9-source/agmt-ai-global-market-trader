"use client";
import {useEffect,useRef,useState} from "react";
import {HubConnectionBuilder,LogLevel} from "@microsoft/signalr";
import {createChart,ColorType,type IChartApi,type ISeriesApi,type CandlestickData,type Time} from "lightweight-charts";

type Tick={symbol?:string;bid?:number;ask?:number;mid?:number;last?:number;timestamp?:string;time?:string;marketState?:string;stale?:boolean;quoteAgeSeconds?:number;source?:string};
type Bar={openTime:string;open:number;high:number;low:number;close:number;isOpen?:boolean};
const tfs=["1m","5m","15m","30m","1h","4h","1d"],secs:Record<string,number>={"1m":60,"5m":300,"15m":900,"30m":1800,"1h":3600,"4h":14400,"1d":86400};

function normalizeTick(input:any):Tick|null {
  const v=Array.isArray(input)?input[0]:input?.tick??input;
  if(!v||typeof v!=="object")return null;
  return {...v,symbol:String(v.symbol??"XAUUSD").toUpperCase()};
}

export default function Home(){
 const el=useRef<HTMLDivElement>(null),chart=useRef<IChartApi|null>(null),series=useRef<ISeriesApi<"Candlestick">|null>(null),lastBar=useRef<CandlestickData<Time>|null>(null),streamLive=useRef(false);
 const [tf,setTf]=useState("5m"),[tick,setTick]=useState<Tick|null>(null),[status,setStatus]=useState("LOADING"),[error,setError]=useState(""),[stamp,setStamp]=useState("");

 useEffect(()=>{if(!el.current)return;const c=createChart(el.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:"#0b1220"},textColor:"#9caec4"},grid:{vertLines:{color:"#1b2a3d"},horzLines:{color:"#1b2a3d"}},timeScale:{timeVisible:true,borderColor:"#26364a"},rightPriceScale:{borderColor:"#26364a"}});chart.current=c;series.current=c.addCandlestickSeries({upColor:"#22c55e",downColor:"#ef4444",borderUpColor:"#22c55e",borderDownColor:"#ef4444",wickUpColor:"#22c55e",wickDownColor:"#ef4444"});return()=>{c.remove();chart.current=null;series.current=null}},[]);

 useEffect(()=>{let ok=true;(async()=>{try{setError("");const r=await fetch("https://biquote.io/api/XAUUSD/ohlc?interval="+tf+"&limit=300",{cache:"no-store"});if(!r.ok)throw Error("OHLC HTTP "+r.status);const j=await r.json();if(!Array.isArray(j.bars)||j.bars.length===0)throw Error("Provider returned no XAUUSD candles");const bars=j.bars.slice().reverse().map((b:Bar)=>({time:Math.floor(new Date(b.openTime).getTime()/1000) as Time,open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close)})).filter((b:any)=>Number.isFinite(Number(b.time))&&[b.open,b.high,b.low,b.close].every(Number.isFinite));if(ok&&series.current&&bars.length){series.current.setData(bars);lastBar.current=bars[bars.length-1];chart.current?.timeScale().fitContent()}}catch(e){if(ok)setError("Candle history: "+String(e))}})();return()=>{ok=false}},[tf]);

 useEffect(()=>{
  let ok=true,conn:any,timer:ReturnType<typeof setInterval>|undefined;
  const apply=(input:any,source:"stream"|"rest")=>{
   const v=normalizeTick(input);if(!ok||!v||v.symbol!=="XAUUSD")return;
   const bid=Number(v.bid),ask=Number(v.ask),mid=Number(v.mid??(Number.isFinite(bid)&&Number.isFinite(ask)?(bid+ask)/2:v.last));
   if(!Number.isFinite(mid)||mid<=0)return;
   setTick(v);setStamp(new Date().toLocaleTimeString());
   if(source==="stream"){streamLive.current=true;setStatus("LIVE");setError("")}
   else if(!streamLive.current)setStatus(v.stale||v.marketState==="closed"?"LAST QUOTE":"REST DATA");
   const ts=Date.parse(v.timestamp||v.time||"");const seconds=Number.isFinite(ts)?Math.floor(ts/1000):Math.floor(Date.now()/1000);
   const bucket=Math.floor(seconds/secs[tf])*secs[tf],p=lastBar.current;
   if(series.current){
    if(!p||Number(p.time)!==bucket){
     const n={time:bucket as Time,open:p?.close??mid,high:Math.max(p?.close??mid,mid),low:Math.min(p?.close??mid,mid),close:mid};
     lastBar.current=n;series.current.update(n);
    }else{
     const n={...p,high:Math.max(p.high,mid),low:Math.min(p.low,mid),close:mid};
     lastBar.current=n;series.current.update(n);
    }
   }
  };
  const getSnapshot=async()=>{
   try{const r=await fetch("https://biquote.io/api/XAUUSD",{cache:"no-store"});if(!r.ok)throw Error("Quote HTTP "+r.status);const data=await r.json();apply(data,"rest")}
   catch(e){if(ok&&!streamLive.current){setStatus("NO DATA");setError("XAUUSD REST quote failed: "+String(e))}}
  };
  getSnapshot();timer=setInterval(getSnapshot,5000);
  (async()=>{try{
   conn=new HubConnectionBuilder().withUrl("https://biquote.io/hubs/tick").withAutomaticReconnect().configureLogging(LogLevel.Warning).build();
   conn.on("ReceiveTick",(payload:any)=>apply(payload,"stream"));
   conn.onreconnecting(()=>{streamLive.current=false;if(ok)setStatus("RECONNECTING")});
   conn.onreconnected(async()=>{try{await conn.invoke("Subscribe",["XAUUSD"]);if(ok&&!streamLive.current)setStatus("CONNECTED · WAITING TICK")}catch(e){if(ok)setError("Resubscribe failed: "+String(e))}});
   await conn.start();await conn.invoke("Subscribe",["XAUUSD"]);if(ok&&!streamLive.current)setStatus("CONNECTED · WAITING TICK");
  }catch(e){if(ok&&!streamLive.current){setStatus("REST FALLBACK");setError("SignalR unavailable; REST fallback active: "+String(e))}}})();
  return()=>{ok=false;if(timer)clearInterval(timer);if(conn)conn.stop()};
 },[tf]);

 const raw=tick?.mid??(tick?.bid!=null&&tick?.ask!=null?(Number(tick.bid)+Number(tick.ask))/2:tick?.last),price=Number(raw);
 return <main><header><div><div className="brand">AGMT <span>GLOBAL MARKET TRADER</span></div><div className="sub">GOLD / US DOLLAR · MARKET TERMINAL</div></div><div className={"status "+(status==="LIVE"?"live":"")}>● {status}</div></header><section className="quote"><div><div className="label">XAUUSD · SPOT GOLD</div><div className="price">{Number.isFinite(price)&&price>0?price.toFixed(2):"—"} <small>USD</small></div><div className="muted">Biquote MT5 feed · {stamp||"Waiting for quote"} · {tick?.marketState||"state pending"} {tick?.stale?"· STALE":""}{tick?.quoteAgeSeconds!=null?" · "+tick.quoteAgeSeconds+"s old":""}</div></div><div className="quotes"><div><span>BID</span><b>{tick?.bid!=null?Number(tick.bid).toFixed(2):"—"}</b></div><div><span>ASK</span><b>{tick?.ask!=null?Number(tick.ask).toFixed(2):"—"}</b></div></div></section><section className="panel"><div className="toolbar"><b>LIVE CANDLESTICK CHART</b><div className="tabs">{tfs.map(x=><button key={x} className={tf===x?"active":""} onClick={()=>setTf(x)}>{x.toUpperCase()}</button>)}</div></div><div ref={el} className="chart"/><div className="legend">REST quote fallback every 5s · SignalR tick stream for real-time candle updates</div></section><section className="panel note"><b>DEMO MARKET DATA</b><p>Live quotes and chart only. No real broker orders or real-money execution are enabled. Gold CFD prices are indicative and may differ from your broker.</p>{error&&<small>{error}</small>}</section><footer>AGMT · XAUUSD · Feed status reflects received provider data, not connection alone.</footer></main>
}
