import {useEffect,useMemo,useState} from 'react'
import { americanToDecimal, impliedProbFromAmerican, clamp, usd } from './utils'

const FEED_HTTP_URL = '/api/odds';
const FEED_WS_URL = null;

function useHttpPoll(onUpdate, enabled=true){
  useEffect(()=>{
    if(!enabled) return;
    const id = setInterval(async ()=>{
      try{
        const res = await fetch(FEED_HTTP_URL);
        if(!res.ok) return;
        const arr = await res.json();
        if(Array.isArray(arr)) arr.forEach(onUpdate);
      }catch(e){}
    }, 2500);
    return ()=>clearInterval(id);
  }, [onUpdate, enabled]);
}

function Metric({label, value, pos}){
  return (<div><div className='label'>{label}</div><div className={'kpi ' + (pos===undefined?'':(pos?'pos':'neg'))}>{value}</div></div>)
}

function RecommendationBanner({recommendation, diff}){
  const {label, tone} = recommendation;
  const toneStyle = tone==='strong' ? {background:'#059669',color:'#fff'} :
                    tone==='lean' ? {background:'#f59e0b',color:'#fff'} :
                    {background:'#e5e7eb',color:'#111827'};
  return (
    <div className='card' style={{...toneStyle, display:'flex', alignItems:'center', justifyContent:'space-between'}}>
      <div><span className='badge' style={{background:'rgba(0,0,0,.2)'}}>Recommendation</span></div>
      <div style={{fontWeight:700}}>{label} — Edge {diff>=0?'+':''}{usd(diff)}</div>
    </div>
  )
}

function HedgingPanel({ stake, decOdds }){
  const [oppDec, setOppDec] = useState(1.80);
  const [feePct, setFeePct] = useState(0);
  const [slipPct, setSlipPct] = useState(0);
  const { h, profitIfWin, profitIfLose, guaranteed } = useMemo(()=>{
    if(!stake || !decOdds || !oppDec) return {h:0, profitIfWin:0, profitIfLose:0, guaranteed:0};
    const effOpp = oppDec * (1 - slipPct);
    const h = (stake * decOdds) / effOpp;
    const feeH = h * feePct;
    const profitIfWin = stake * (decOdds - 1) - h - feeH;
    const profitIfLose = h * (effOpp - 1) - stake - feeH;
    return { h, profitIfWin, profitIfLose, guaranteed: Math.min(profitIfWin, profitIfLose) };
  }, [stake, decOdds, oppDec, feePct, slipPct]);
  return (
    <div className='card'>
      <div className='label'>Hedge Calculator (equal‑profit)</div>
      <div className='grid grid-3'>
        <label className='text-sm'>Opposite decimal odds
          <input className='input' type='number' step='0.01' value={oppDec} onChange={e=>setOppDec(Number(e.target.value)||0)} />
        </label>
        <label className='text-sm'>Fee %
          <input className='input' type='number' step='0.001' value={feePct} onChange={e=>setFeePct(Number(e.target.value)||0)} />
        </label>
        <label className='text-sm'>Slippage %
          <input className='input' type='number' step='0.001' value={slipPct} onChange={e=>setSlipPct(Number(e.target.value)||0)} />
        </label>
      </div>
      <div className='grid grid-3' style={{marginTop:12}}>
        <div><div className='label'>Hedge Stake</div><div className='kpi'>{usd(h)}</div></div>
        <div><div className='label'>Profit if Original Wins</div><div className={'kpi ' + (profitIfWin>=0?'pos':'neg')}>{usd(profitIfWin)}</div></div>
        <div><div className='label'>Profit if Original Loses</div><div className={'kpi ' + (profitIfLose>=0?'pos':'neg')}>{usd(profitIfLose)}</div></div>
      </div>
      <div className='text-sm' style={{marginTop:8}}>Guaranteed (min) profit ≈ <b style={{color: guaranteed>=0?'#065f46':'#991b1b'}}>{usd(guaranteed)}</b></div>
    </div>
  )
}

function BetCard({ bet, alertConfig, pushAlert }){
  const [liveProb, setLiveProb] = useState(bet.startProb);
  const [cashout, setCashout] = useState(bet.cashoutOffer ?? bet.stake*0.6);
  const decOdds = useMemo(()=>americanToDecimal(bet.oddsUS), [bet.oddsUS]);
  const evHold = useMemo(()=> (liveProb * bet.stake * decOdds) - bet.stake, [liveProb, bet.stake, decOdds]);
  const evCash = useMemo(()=> cashout - bet.stake, [cashout, bet.stake]);
  const recommendation = useMemo(()=>{
    const diff = evHold - evCash;
    const edge = Math.abs(diff);
    const label = diff >= 0 ? 'Hold' : 'Cash out';
    const tone = edge > bet.stake*0.10 ? 'strong' : edge > bet.stake*0.03 ? 'lean' : 'fine';
    return {label, tone, diff};
  }, [evHold, evCash, bet.stake]);
  useHttpPoll((msg)=>{
    if(msg.id !== bet.id) return;
    if(typeof msg.liveProb === 'number') setLiveProb(clamp(msg.liveProb, 0.01, 0.99));
    if(typeof msg.cashoutOffer === 'number') setCashout(msg.cashoutOffer);
  }, true);
  useEffect(()=>{
    const diff = evHold - evCash;
    const roi = cashout / bet.stake - 1;
    if(alertConfig?.edgePct && Math.abs(diff) >= bet.stake*alertConfig.edgePct){
      pushAlert?.({ id: bet.id+'-edge', type: 'edge', message: `${bet.event}: ${diff>=0?'Hold':'Cash out'} edge ${usd(Math.abs(diff))}` });
    }
    if(alertConfig?.targetROI && roi >= alertConfig.targetROI){
      pushAlert?.({ id: bet.id+'-roi', type: 'roi', message: `${bet.event}: Cash‑out ROI ${(roi*100).toFixed(1)}% reached` });
    }
  }, [evHold, evCash, cashout, bet, alertConfig, pushAlert]);
  return (
    <div className='card'>
      <div className='row'>
        <div>
          <div className='h2'>{bet.event}</div>
          <div className='text-sm'>Pick: <b>{bet.selection}</b> · Odds {bet.oddsUS>0?`+${bet.oddsUS}`:bet.oddsUS} <span className='text-sm'> (dec {(decOdds).toFixed(2)})</span></div>
        </div>
        <div style={{textAlign:'right'}}><div className='text-xs'>Stake</div><div className='kpi'>{usd(bet.stake)}</div></div>
      </div>
      <div className='grid grid-3'>
        <div className='card'>
          <div className='label'>Live Win Probability</div>
          <div className='kpi'>{(liveProb*100).toFixed(1)}%</div>
          <input type='range' min={1} max={99} value={Math.round(liveProb*100)} onChange={e=>setLiveProb(Number(e.target.value)/100)} style={{width:'100%', marginTop:8}} />
          <div className='text-xs' style={{marginTop:6}}>Feed controls this; slider lets you simulate.</div>
        </div>
        <div className='card'>
          <div className='label'>Book Cash‑Out Offer</div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}><input className='input' type='number' value={cashout} onChange={e=>setCashout(Number(e.target.value)||0)} style={{maxWidth:160}} /><span className='text-sm'>USD</span></div>
          <div className='text-xs' style={{marginTop:6}}>Feed may update if your book exposes an endpoint.</div>
        </div>
        <HedgingPanel stake={bet.stake} decOdds={decOdds} />
      </div>
      <div className='grid grid-2'>
        <div className='card'><div className='label'>EV (Hold)</div><div className={'kpi ' + (evHold>=0?'pos':'neg')}>{usd(evHold)}</div><div className='text-xs'>Expected profit if you let it ride.</div></div>
        <div className='card'><div className='label'>EV (Cash Out Now)</div><div className={'kpi ' + (evCash>=0?'pos':'neg')}>{usd(evCash)}</div><div className='text-xs'>Profit locked in by cashing out now.</div></div>
      </div>
      <RecommendationBanner recommendation={recommendation} diff={evHold-evCash} />
      <div className='row text-xs'><div>Ticket ID: {bet.id}</div><div>Analytics only. Not financial advice.</div></div>
    </div>
  )
}

function AlertsPanel({ alerts, clear, config, setConfig }){
  return (
    <div className='card'>
      <div className='row'><div className='h2'>Alerts</div><button className='btn secondary' onClick={clear}>Clear</button></div>
      <div className='grid grid-3'>
        <label className='text-xs'>Edge threshold (% of stake)
          <input className='input' type='number' step='0.01' value={config.edgePct} onChange={e=>setConfig({...config, edgePct:Number(e.target.value)||0})} />
        </label>
        <label className='text-xs'>Target cash‑out ROI
          <input className='input' type='number' step='0.01' value={config.targetROI} onChange={e=>setConfig({...config, targetROI:Number(e.target.value)||0})} />
        </label>
        <div className='text-xs'>Web Push ready: attach Service Worker & Notification API later.</div>
      </div>
      <ul style={{maxHeight:160, overflow:'auto', marginTop:8}}>
        {alerts.map(a => (<li key={a.id} className='text-sm'><span className='alert-dot'/> {a.message}</li>))}
      </ul>
    </div>
  )
}

function TicketUploader({ onAdd }){
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ event:'', selection:'', stake:100, oddsUS:-110, cashoutOffer:0, id:'', book:'' });
  const submit = ()=>{
    const startProb = impliedProbFromAmerican(form.oddsUS);
    const id = form.id || `${form.event.substring(0,12)}-${Date.now()}`;
    onAdd?.({ ...form, id, startProb });
    setOpen(false);
  }
  return (
    <div>
      <button className='btn' onClick={()=>setOpen(true)}>Add Ticket</button>
      {open && (
        <div className='modal'>
          <div className='modal-card'>
            <div className='row'><div className='h2'>Add Ticket</div><button className='btn secondary' onClick={()=>setOpen(false)}>Close</button></div>
            <div className='grid grid-2'>
              <label className='text-sm'>Event<input className='input' value={form.event} onChange={e=>setForm({...form, event:e.target.value})}/></label>
              <label className='text-sm'>Selection<input className='input' value={form.selection} onChange={e=>setForm({...form, selection:e.target.value})}/></label>
              <label className='text-sm'>Stake (USD)<input className='input' type='number' value={form.stake} onChange={e=>setForm({...form, stake:Number(e.target.value)||0})}/></label>
              <label className='text-sm'>Odds (US)<input className='input' type='number' value={form.oddsUS} onChange={e=>setForm({...form, oddsUS:Number(e.target.value)||0})}/></label>
              <label className='text-sm'>Cash‑out Offer<input className='input' type='number' value={form.cashoutOffer} onChange={e=>setForm({...form, cashoutOffer:Number(e.target.value)||0})}/></label>
              <label className='text-sm'>Ticket ID (optional)<input className='input' value={form.id} onChange={e=>setForm({...form, id:e.target.value})}/></label>
              <label className='text-sm'>Book (optional)<input className='input' value={form.book} onChange={e=>setForm({...form, book:e.target.value})}/></label>
            </div>
            <div className='card' style={{marginTop:8}}>
              <div className='h2' style={{fontSize:14}}>Screenshot drop (placeholder)</div>
              <input type='file' accept='image/*'/>
              <div className='text-xs'>OCR parsing can be added later.</div>
            </div>
            <div className='row' style={{justifyContent:'flex-end', marginTop:8}}>
              <button className='btn secondary' onClick={()=>setOpen(false)}>Cancel</button>
              <button className='btn' onClick={submit}>Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const DEMO_BETS = [
  { id:'NFL-GB@DAL-2025W9-ML', event:'NFL: Packers @ Cowboys (Moneyline)', selection:'Cowboys ML', stake:200, oddsUS:-150, startProb:impliedProbFromAmerican(-150), cashoutOffer:260 },
  { id:'NBA-LAL@BOS-2025-Spread', event:'NBA: Lakers @ Celtics (Spread -3.5)', selection:'Celtics -3.5', stake:150, oddsUS:-110, startProb:impliedProbFromAmerican(-110), cashoutOffer:190 },
  { id:'UCL-RMA@MCI-2025-Over2.5', event:'UCL: Real Madrid @ Man City (Over/Under)', selection:'Over 2.5', stake:100, oddsUS:120, startProb:impliedProbFromAmerican(120), cashoutOffer:130 },
];

export default function Home(){
  const [bets, setBets] = useState(DEMO_BETS);
  const [alerts, setAlerts] = useState([]);
  const [alertConfig, setAlertConfig] = useState({ edgePct: 0.05, targetROI: 0.30 });
  const pushAlert = (a)=> setAlerts(prev => prev.find(x=>x.id===a.id) ? prev : [a, ...prev].slice(0,50));
  const addTicket = (t)=> setBets(prev=>[t, ...prev]);
  return (
    <div className='container'>
      <header className='row'>
        <div><div className='h1'>Real‑Time Cash‑Out Advisor</div><div className='text-sm'>Live feed ready · Upload tickets · Hedge calculator · Alerting</div></div>
        <TicketUploader onAdd={addTicket} />
      </header>
      <section className='grid'><AlertsPanel alerts={alerts} clear={()=>setAlerts([])} config={alertConfig} setConfig={setAlertConfig} /></section>
      <main className='grid' style={{marginTop:16}}>{bets.map(bet => (<BetCard key={bet.id} bet={bet} alertConfig={alertConfig} pushAlert={pushAlert} />))}</main>
      <footer style={{marginTop:16}}><div>Responsible betting only. Analytics only.</div><div>Mock feed at <code>/api/odds</code>. Swap to your provider for realtime.</div></footer>
    </div>
  )
}