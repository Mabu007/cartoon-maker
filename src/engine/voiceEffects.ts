export const voiceLooks = {
  natural: { pitch:0, bass:0, clarity:0 },
  'deep-bass': { pitch:-5, bass:7, clarity:-1 },
  champ: { pitch:-2, bass:4, clarity:4 },
  bright: { pitch:3, bass:-2, clarity:4 },
  cartoon: { pitch:7, bass:-4, clarity:2 }
} as const;
export type VoiceLook = keyof typeof voiceLooks;
export type VoiceEffect = {pitch:number;bass:number;clarity:number};

/** Overlap short, phase-matched grains to change pitch at the original clip length. */
export function shiftVoice(channels:Float32Array[], sampleRate:number, semitones:number) {
  if(!semitones||!channels[0]?.length)return channels;
  const ratio=2**(semitones/12), size=channels[0].length;
  const mono=channels[0], hop=Math.round(sampleRate*.028), search=Math.round(sampleRate*.009);
  const stride=Math.max(1,Math.floor(sampleRate/6500));
  const result=channels.map(()=>new Float32Array(size));
  const read=(channel:Float32Array, index:number)=>{
    if(index<0||index>=size)return 0;
    const i=Math.floor(index), f=index-i;
    return channel[i]+((channel[i+1]??0)-channel[i])*f;
  };
  let previous=0;
  for(let start=0;start<size;start+=hop){
    let pick=start;
    if(start){
      let best=-Infinity;
      for(let delta=-search;delta<=search;delta+=stride*2){
        const candidate=start+delta;
        if(candidate<0||candidate>=size)continue;
        let dot=0, before=1e-8, after=1e-8;
        for(let j=0;j<hop;j+=stride*4){
          const a=read(mono,previous+(hop+j)*ratio), b=read(mono,candidate+j*ratio);
          dot+=a*b;before+=a*a;after+=b*b;
        }
        const score=dot/Math.sqrt(before*after)-.09*Math.abs(delta)/search;
        if(score>best){pick=candidate;best=score;}
      }
    }
    for(let channel=0;channel<channels.length;channel++){
      const input=channels[channel], output=result[channel];
      for(let j=0;j<Math.min(hop,size-start);j++){
        const next=read(input,pick+j*ratio);
        const weight=start?j/hop:1;
        output[start+j]=weight*next+(1-weight)*read(input,previous+(hop+j)*ratio);
      }
    }
    previous=pick;
  }
  return result;
}
