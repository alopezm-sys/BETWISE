export function americanToDecimal(american){
  if(american>0) return 1 + american/100;
  return 1 + 100/Math.abs(american);
}
export function impliedProbFromAmerican(american){
  if(american>0) return 100/(american+100);
  return Math.abs(american)/(Math.abs(american)+100);
}
export function clamp(n,min,max){ return Math.min(Math.max(n,min),max); }
export function usd(n){ return (n||0).toLocaleString(undefined,{style:'currency',currency:'USD'}) }