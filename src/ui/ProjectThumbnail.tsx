import { scenePalettes } from '../engine/presets.ts';
import type { Project } from '../engine/schema.ts';

/** Project cards use their real cast/world rather than generic film icons.
 * This SVG is lightweight and safe to render from saved project metadata.
 */
export function projectPreviewInfo(project:Project){
  const scene=project.scenes.find(item=>item.actors.length||item.backgroundImage||item.clips.length)??project.scenes[0];
  return {
    scene,seconds:project.scenes.reduce((total,item)=>total+item.duration,0),
    sceneCount:project.scenes.length,
    characterCount:new Set(project.scenes.flatMap(item=>item.actors.map(actor=>actor.characterId))).size,
    clipCount:project.scenes.reduce((total,item)=>total+item.clips.length,0)
  };
}
export function ProjectThumbnail({project,compact=false}:{project:Project;compact?:boolean}){
  const {scene}=projectPreviewInfo(project);
  const palette=scenePalettes[scene.environment]??scenePalettes['Living room'];
  const id='film-'+project.id.replace(/[^a-zA-Z0-9-]/g,'').slice(0,40);
  const stageActors=scene.actors.slice(0,5);
  const stageProps=scene.objects.slice(0,12).sort((a,b)=>a.depth-b.depth);
  return <svg className={compact?'movie-thumb movie-thumb-small':'movie-thumb'}
    viewBox="0 0 960 540" preserveAspectRatio="xMidYMid slice" role="img"
    aria-label={`Preview of ${project.name}, ${scene.environment}`}>
    <defs>
      <linearGradient id={id+'wall'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={palette[0]}/><stop offset="1" stopColor={palette[1]}/>
      </linearGradient>
      <linearGradient id={id+'floor'} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={palette[2]}/><stop offset="1" stopColor={palette[3]}/>
      </linearGradient>
      <linearGradient id={id+'light'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity=".19"/>
        <stop offset="1" stopColor="#fff" stopOpacity="0"/>
      </linearGradient>
    </defs>
    <rect width="960" height="540" fill={`url(#${id}wall)`}/>
    <rect y="350" width="960" height="190" fill={`url(#${id}floor)`}/>
    <path d="M0 350H960" stroke="#fff" strokeOpacity=".23" strokeWidth="5"/>
    <path d="M0 540L390 350M960 540L570 350" stroke="#141322" strokeOpacity=".08" strokeWidth="4"/>
    <rect x="70" y="75" width="215" height="190" rx="16" fill="#231d31" fillOpacity=".25" stroke="#fff" strokeOpacity=".3" strokeWidth="8"/>
    <rect x="87" y="91" width="182" height="158" rx="8" fill={scene.environment==='Township street'?'#eac7a0':'#a3bfd5'}/>
    <path d="M178 92V248M88 174H270" stroke="#fbf2e4" strokeWidth="12"/>
    <circle cx="238" cy="114" r="25" fill="#fef3d4" opacity=".64"/>
    {scene.backgroundImage&&<image href={scene.backgroundImage} width="960" height="540"
      preserveAspectRatio="xMidYMid slice"/>}
    {!scene.backgroundImage&&stageProps.map(object=><g key={object.id}
      transform={`translate(${object.x} ${object.y}) rotate(${object.rotation}) scale(${object.scale})`}>
      {object.imageData?<image href={object.imageData}
        x={-(object.imageWidth??90)/2} y={-(object.imageHeight??90)}
        width={object.imageWidth??90} height={object.imageHeight??90}/>
        :<><ellipse cy="7" rx="56" ry="13" fill="#141222" opacity=".14"/>
          <rect x="-40" y="-68" width="80" height="67" rx="11"
            fill={object.color} stroke="#282034" strokeOpacity=".35" strokeWidth="5"/>
          <rect x="-31" y="-58" width="62" height="11" rx="5" fill="#fff" opacity=".2"/></>}
    </g>)}
    {stageActors.map(actor=>{
      const character=project.characters.find(item=>item.id===actor.characterId);
      const skin=character?.skin??'#b98c6c';
      const shirt=character?.shirt??'#8674c4';
      const pants=character?.pants??'#29283d';
      const scale=actor.scale*.96;
      return <g key={actor.id}
        transform={`translate(${Math.max(26,Math.min(934,actor.x))} ${Math.max(165,Math.min(510,actor.y))}) scale(${scale})`}>
        <ellipse rx="41" ry="12" cy="5" opacity=".18" fill="#171326"/>
        <path d="M-16-87L-19-6M16-87L19-6" stroke={pants} strokeWidth="18" strokeLinecap="round"/>
        <path d="M-22-4H-4M4-4H24" stroke={character?.shoes??'#272633'} strokeWidth="12" strokeLinecap="round"/>
        <path d="M-36-142L-49-98M36-142L49-98" stroke={skin} strokeWidth="12" strokeLinecap="round"/>
        <path d="M-38-151Q0-176 38-151L30-89Q0-77-30-89Z"
          fill={shirt} stroke="#292436" strokeWidth="5"/>
        <ellipse cx="0" cy="-205" rx={character?.shape==='square'?39:35}
          ry={character?.shape==='oval'?54:43} fill={skin} stroke="#3d2935" strokeWidth="5"/>
        <path d="M-33-232Q0-265 33-232L28-246Q0-268-28-246Z"
          fill={character?.hairColor??'#2e2535'}/>
        <circle cx="-13" cy="-209" r="5" fill="#2a2534"/><circle cx="13" cy="-209" r="5" fill="#2a2534"/>
        <path d="M-12-188Q0-179 12-188" fill="none" stroke="#663b49" strokeWidth="4" strokeLinecap="round"/>
      </g>;
    })}
    <rect width="960" height="540" fill={`url(#${id}light)`}/>
    <path d="M35 72V35H82M878 35H925V72M35 468V505H82M878 505H925V468"
      fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="6" strokeLinecap="round"/>
  </svg>;
}
