/* Original WebAudio synthesis. No samples, no third-party game sounds. */
(function(root){
  'use strict';
  class ArenaAudio{
    constructor(){this.ctx=null;this.enabled=true;this.noise=null;this.lastHeart=0;}
    unlock(){
      if(!this.ctx){const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)return;
        this.ctx=new Audio();this.master=this.ctx.createGain();this.master.gain.value=this.enabled?.36:0;this.master.connect(this.ctx.destination);
        this.noise=this.ctx.createBuffer(1,this.ctx.sampleRate,this.ctx.sampleRate);const d=this.noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
      }if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
    }
    toggle(){this.enabled=!this.enabled;if(this.master)this.master.gain.setTargetAtTime(this.enabled?.36:0,this.ctx.currentTime,.03);return this.enabled;}
    tone(f,end,duration,gain=.2,type='sine',delay=0){if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
      const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),v=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(10,end),t+duration);v.gain.setValueAtTime(.001,t);v.gain.linearRampToValueAtTime(gain,t+.004);v.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(v);v.connect(this.master);o.start(t);o.stop(t+duration+.02);
    }
    burst(duration,freq,gain=.3,pan=0,delay=0){if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
      const t=this.ctx.currentTime+delay,n=this.ctx.createBufferSource(),filter=this.ctx.createBiquadFilter(),v=this.ctx.createGain();n.buffer=this.noise;filter.type='lowpass';filter.frequency.setValueAtTime(freq,t);filter.frequency.exponentialRampToValueAtTime(150,t+duration);v.gain.setValueAtTime(gain,t);v.gain.exponentialRampToValueAtTime(.001,t+duration);n.connect(filter);filter.connect(v);
      if(this.ctx.createStereoPanner){const p=this.ctx.createStereoPanner();p.pan.value=Math.max(-1,Math.min(1,pan));v.connect(p);p.connect(this.master);}else v.connect(this.master);
      n.start(t,Math.random()*.4);n.stop(t+duration);
    }
    fire(weapon,volume=1,pan=0){if(volume<.015)return;
      const shapes=[[.13,2400,.36,105],[.12,3000,.40,160],[.13,1800,.13,440],[.28,1700,.67,72],[.12,3800,.18,310],[.19,2200,.47,85]];
      const [duration,f,g,base]=shapes[weapon];this.burst(duration,f,g*volume,pan);this.tone(base,weapon===2?180:40,duration,.18*volume,weapon===4?'triangle':'sine');
      if(weapon===4)this.tone(760,170,.16,.12*volume,'triangle');if(weapon===5)this.burst(.035,5600,.15*volume,pan,.065);
    }
    event(type){
      if(type==='hit'){this.tone(970,650,.045,.12,'triangle');}
      else if(type==='kill'){this.tone(550,700,.08,.18,'triangle');this.tone(900,1200,.12,.15,'triangle',.065);}
      else if(type==='hurt'){this.burst(.13,680,.24);this.tone(92,45,.14,.2);}
      else if(type==='empty'){this.tone(180,110,.045,.13,'square');}
      else if(type==='reload'){this.burst(.1,3100,.11);this.burst(.065,4100,.1,0,.28);}
      else if(type==='roundStart'){this.tone(350,350,.12,.16,'triangle');this.tone(525,525,.2,.15,'triangle',.14);}
      else if(type==='landing'){this.burst(.16,430,.22);}
      else if(type==='pickup'){this.tone(640,1150,.13,.1,'sine');}
    }
    heartbeat(time){if(time-this.lastHeart<.85)return;this.lastHeart=time;this.tone(66,40,.13,.22);this.tone(61,35,.14,.17,'sine',.17);}
  }root.CA.ArenaAudio=ArenaAudio;
})(typeof window!=='undefined'?window:globalThis);
