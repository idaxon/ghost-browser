/**
 * GhostStack WebRTC Shield
 * Prevents WebRTC IP leak by overriding RTCPeerConnection.
 * @module WebRTCShield
 */

export class WebRTCShield {
  /** Get injection script to block WebRTC IP leaks */
  getInjectionScript(): string {
    return `
// WebRTC IP Leak Prevention
if(typeof RTCPeerConnection!=='undefined'){
  const _OrigRTC=RTCPeerConnection;
  window.RTCPeerConnection=function(config,...args){
    if(config&&config.iceServers){
      config.iceServers=config.iceServers.map(s=>({...s,urls:Array.isArray(s.urls)?s.urls.filter(u=>!u.startsWith('stun:')):s.urls}));
    }
    const pc=new _OrigRTC(config,...args);
    const _origCreate=pc.createDataChannel.bind(pc);
    const _origAddIce=pc.addIceCandidate.bind(pc);
    const _origSetLocal=pc.setLocalDescription.bind(pc);
    pc.createDataChannel=function(){return _origCreate.apply(pc,arguments);};
    const origOnIce=Object.getOwnPropertyDescriptor(RTCPeerConnection.prototype,'onicecandidate');
    if(origOnIce&&origOnIce.set){
      let _userHandler=null;
      Object.defineProperty(pc,'onicecandidate',{
        get(){return _userHandler;},
        set(handler){
          _userHandler=function(event){
            if(event.candidate&&event.candidate.candidate){
              const c=event.candidate.candidate;
              if(c.includes('.local')||/([0-9]{1,3}\\.){3}[0-9]{1,3}/.test(c)){
                const sanitized=c.replace(/([0-9]{1,3}\\.){3}[0-9]{1,3}/g,'0.0.0.0');
                const newCandidate=new RTCIceCandidate({...event.candidate.toJSON(),candidate:sanitized});
                handler({...event,candidate:newCandidate});
                return;
              }
            }
            handler(event);
          };
        }
      });
    }
    return pc;
  };
  window.RTCPeerConnection.prototype=_OrigRTC.prototype;
}`
  }
}
