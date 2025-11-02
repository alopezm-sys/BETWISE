let tick = 0;
const KNOWN = [
  { id: 'NFL-GB@DAL-2025W9-ML', baseP: 0.60, stake: 200, baseCash: 260 },
  { id: 'NBA-LAL@BOS-2025-Spread', baseP: 0.54, stake: 150, baseCash: 190 },
  { id: 'UCL-RMA@MCI-2025-Over2.5', baseP: 0.45, stake: 100, baseCash: 130 },
];
export default function handler(req, res){
  tick++;
  const out = KNOWN.map(k => {
    const drift = (Math.sin((tick + k.baseP*10)/7) + (Math.random()-0.5)*0.6) * 0.02;
    let liveProb = Math.max(0.03, Math.min(0.97, k.baseP + drift));
    const cashoutOffer = Math.max(0, k.baseCash + (Math.random()-0.5)*10);
    return { id: k.id, liveProb, cashoutOffer };
  });
  res.status(200).json(out);
}