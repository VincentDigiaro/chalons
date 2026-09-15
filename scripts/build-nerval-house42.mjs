// Specific reconstruction from the two close views supplied on 13/09/2026.
// The fixed pane is on the left brick plinth; the full-height door is on the
// right. Estimated joinery dimensions, supported by the existing OSM volume.
export function buildHouse42(ctx){
 const {parts,survey,objects,poly,beam,box,rgb,add,sub,mul,len,norm,materials:M}=ctx;
 const p=parts.get(112),tall=parts.get(115),{u,v}=p,at=(x,y,z)=>[...p.world([x,y]),z];
 const solid=(x,y,w,d,z0,z1,col,material=M.wall)=>box(p.world([x,y]),u,v,w,d,z0,z1,rgb(col),material);
 const line=(a,b,w,col)=>beam(at(...a),at(...b),w,rgb(col));
 const front=(x0,x1,y,z0,z1,col,material=M.wall)=>poly([at(x0,y,z0),at(x1,y,z0),at(x1,y,z1),at(x0,y,z1)],material,rgb(col),[[0,0],[1,0],[1,1],[0,1]]);
 const wood='#503c2c',edgeWood='#665039',darkWood='#3b3027',zinc='#626962';
 const o=survey.openings.find(o=>[112,115].includes(o.part)&&o.kind==='entrance'),host=parts.get(o.part);
 const extent=p.surfaceBounds.front,entryExtent=host.surfaceBounds.front,x=entryExtent[0]+o.along*(entryExtent[1]-entryExtent[0]);
 const left=x-o.width/2,right=x+o.width/2,split=left+.75;
 const lowWall=p.bounds[0][1],wall=host.bounds[0][1],face=wall-o.bayDepth,base=o.bottom,head=base+o.height;

 // Floor and shadowed interior. Every visible return has actual depth.
 solid(x,wall-o.bayDepth/2,o.width+.04,o.bayDepth+.10,.04,base,'#aca395');
 solid(x,face-.10,o.width+.18,.30,.025,.095,'#c6c3b5');
 front(left+.02,right-.02,wall+.10,base,head,'#303c34');
 poly([at(left,wall,head),at(right,wall,head),at(right,face,head),at(left,face,head)],M.wall,rgb('#554b3c'));

 // A staggered multitone brick plinth, including the narrow visible left return.
 const brickTop=.79,brickHeight=.085,brickWidth=.205,joint=.012;
 solid((left+split)/2,(wall+face)/2,split-left,o.bayDepth,base,brickTop,'#998a70');
 const brickColors=['#9a7954','#b0936b','#8f7352','#b69970','#7e715b','#aa875e'];
 for(let row=0,z=base+.012;z<brickTop-.02;row++,z+=brickHeight+joint){
  for(let col=-1,xx=left-(row%2)*brickWidth/2;xx<split;col++,xx+=brickWidth+joint){
   const a=Math.max(left+.006,xx),b=Math.min(split-.006,xx+brickWidth);if(b-a<.016)continue;
   solid((a+b)/2,face-.011,b-a,.033,z,Math.min(z+brickHeight,brickTop-.014),brickColors[(row*5+col+13)%brickColors.length]);
  }
  for(let j=0,yy=face+.012;yy<wall;yy+=brickWidth+joint,j++){
   const b=Math.min(yy+brickWidth,wall);solid(left-.012,(yy+b)/2,.035,b-yy,z,Math.min(z+brickHeight,brickTop-.014),brickColors[(row+j+2)%brickColors.length]);
  }
 }
 solid((left+split)/2,face+.035,split-left+.065,.19,brickTop,brickTop+.045,'#705941');

 // Fixed tall pane and its return: fine timber frame, no arbitrary midrail.
 front(left+.055,split-.050,face-.004,brickTop+.09,head-.055,'#97a49a',M.glass);
 poly([at(left-.003,wall-.025,brickTop+.075),at(left-.003,face+.03,brickTop+.075),at(left-.003,face+.03,head-.055),at(left-.003,wall-.025,head-.055)],M.glass,rgb('#657c6c'),[[0,0],[1,0],[1,1],[0,1]]);
 for(const xx of [left,split,right])solid(xx,face,.075,.115,base,head,wood);
 solid((left+split)/2,face,split-left,.10,brickTop+.035,brickTop+.10,wood);
 solid(x,face,o.width+.09,.14,head-.04,head+.045,wood);
 for(const xx of [left,right]){
  solid(xx,wall,.075,.085,base,head,wood);
  line([xx,wall,head],[xx,face,head],.075,wood);
  line([xx,wall,brickTop+.065],[xx,face,brickTop+.065],.055,wood);
 }
 // Door set slightly behind the fixed pane, with a narrow transom and a
 // separate outer frame. Its left stile carries the handle and lock plate.
 const doorLeft=split+.055,doorRight=right-.05,doorY=face+.026,transom=head-.28;
 front(doorLeft,doorRight,doorY,base+.065,transom-.035,darkWood);
 front(doorLeft+.048,doorRight-.048,doorY-.008,base+.22,transom-.08,'#4f6661',M.glass);
 front(doorLeft+.02,doorRight-.02,face+.018,transom+.035,head-.06,'#74877b',M.glass);
 for(const xx of [doorLeft,doorRight])solid(xx,doorY,.055,.075,base+.04,transom,edgeWood);
 for(const zz of [base+.09,transom])solid((doorLeft+doorRight)/2,doorY,doorRight-doorLeft,.08,zz-.03,zz+.03,edgeWood);
 solid((doorLeft+doorRight)/2,doorY,doorRight-doorLeft-.10,.03,base+.10,base+.21,'#69563f');
 solid(split+.10,face-.055,.035,.028,1.00,1.15,'#a59a78');
 line([split+.10,face-.095,1.07],[split+.23,face-.095,1.07],.022,'#c2b99b');
 solid(split+.10,face-.071,.018,.015,.97,.995,'#3b3d34');
 solid(right+.047,wall-.045,.075,.035,1.27,1.37,'#ada894');
 front(right+.02,right+.063,wall-.066,1.30,1.34,'#353f36');
 // The right return closes the glazed vestibule against the plaster jamb.
 poly([at(right,face,base+.10),at(right,wall,base+.10),at(right,wall,head),at(right,face,head)],M.wall,rgb('#584936'));
 for(const xx of [left-.025,split-.028,right-.028])line([xx,face-.06,base+.09],[xx,face-.06,head-.06],.012,'#796345');

 // Continuous tiled eaves cover the vestibule. No gap between its timber head
 // and the roof soffit; the rain gutter is on the supported roof edge.
 const roofFront=face-.12,roofBack=wall+.065,slope=2*p.rise/(p.roofEnd-lowWall);
 const roofZ=y=>p.eaves+(y-lowWall)*slope+.018;
 const roofBackZ=roofZ(roofBack),eaveZ=roofZ(roofFront)-.08;
 const a=left-.14,b=extent[1]+.14,roofMid=(lowWall+p.roofEnd)/2,roofUV=(x,y)=>[x/1.65,Math.abs(y-roofMid)*Math.hypot(1,slope)/1.28];
 poly([at(a,roofBack,roofBackZ),at(b,roofBack,roofBackZ),at(b,roofFront,eaveZ+.08),at(a,roofFront,eaveZ+.08)],M.roof,[.96,.97,1],[roofUV(a,roofBack),roofUV(b,roofBack),roofUV(b,roofFront),roofUV(a,roofFront)]);
 poly([at(a,roofBack,roofBackZ-.10),at(b,roofBack,roofBackZ-.10),at(b,roofFront,eaveZ),at(a,roofFront,eaveZ)],M.wall,rgb('#665d4b'));
 solid((a+b)/2,roofFront,b-a,.08,eaveZ-.01,eaveZ+.105,'#635d4c');
 line([a,roofFront-.045,eaveZ+.04],[b,roofFront-.045,eaveZ+.04],.105,'#4b554f');
 for(let xx=a+.14;xx<b;xx+=.38)solid(xx,roofFront-.07,.026,.08,eaveZ-.045,eaveZ+.09,zinc);
 for(const xx of [left-.09,right+.08])line([xx,roofFront+.10,head-.02],[xx,wall+.035,roofBackZ-.10],.065,wood);
 // Pale infill links the entry return to the original low facade. Above the
 // glazed side the tiled roof abuts the taller plaster wall, as in the photo.
 front(right+.04,extent[0]+.03,lowWall,base,3.0,'#c2bfaf');
 poly([at(left,face,head+.025),at(left,wall,head+.025),at(left,wall,roofBackZ-.08),at(left,face,roofZ(face)-.08)],M.wall,rgb('#bebbaa'));
 // Bent downpipe on the right, with visible collar brackets.
 const drainX=extent[1]-.11;
 const drain=[[drainX,roofFront-.075,eaveZ+.03],[drainX,roofFront-.075,2.68],[drainX,lowWall-.10,2.45],[drainX,lowWall-.10,.19],[drainX+.13,lowWall-.18,.075]];
 for(let i=0;i<drain.length-1;i++)line(drain[i],drain[i+1],.063,zinc);
 for(const z of [.48,1.43,2.30])solid(drainX,lowWall-.10,.084,.085,z,z+.03,'#555f57');

 // Soft, folded curtain glazing inside the existing white window frames.
 for(const q of survey.openings.filter(q=>q.side==='front'&&(([112,115].includes(q.part)&&!q.closed&&!q.kind&&!q.awning)||(q.part===115&&q.kind==='patio')))){
  const part=parts.get(q.part),span=part.surfaceBounds.front,c=span[0]+q.along*(span[1]-span[0]),y=part.bounds[0][1];
  for(const sign of [-1,1]){
   const x0=c+(sign<0?-q.width/2+.082:.042),x1=c+(sign<0?-.042:q.width/2-.082);
   front(x0,x1,y+.105,q.bottom+.085,q.bottom+q.height-.085,'#a5b0a9',M.glass);
  }
 }
 // Two slim iron retaining bars across the closed shutter and hinge straps on
 // both low windows. Their leaves remain separate geometry in the main model.
 for(const q of survey.openings.filter(q=>q.part===112&&q.side==='front'&&q.shutters)){
  const c=extent[0]+q.along*(extent[1]-extent[0]);
  if(q.closed)for(const z of [q.bottom+.21,q.bottom+q.height-.20])line([c-q.width/2-.025,lowWall-.145,z],[c+q.width/2+.025,lowWall-.145,z],.026,'#2c302b');
  for(const s of [-1,1])for(const z of [q.bottom+.18,q.bottom+q.height-.18])solid(c+s*(q.width/2+.055),lowWall-.13,.07,.035,z-.018,z+.018,'#30362e');
 }
 // Glazed door and window set back in the tall portion: plaster reveals are
 // already cut in the mesh. Add rainwater elbows down to the lower roof.
 const tx=tall.surfaceBounds.front[0]+(tall.surfaceBounds.front[1]-tall.surfaceBounds.front[0])*.58,ty=tall.bounds[0][1]-.13;
 const leftDrain=tall.surfaceBounds.front[0]+.10;
 line([leftDrain,ty,5.27],[leftDrain,ty,.19],.061,zinc);
 line([leftDrain,ty,.19],[leftDrain-.14,ty-.06,.08],.061,zinc);
 for(const z of [.5,2.0,3.8])solid(leftDrain,ty,.081,.081,z,z+.032,zinc);
 const zz=p.roofHeight([tx,ty]);
 line([tx,ty,5.18],[tx+.16,ty,4.93],.062,zinc);line([tx+.16,ty,4.93],[tx+.16,ty,zz+.10],.062,zinc);
 line([tx+.16,ty,zz+.10],[tall.surfaceBounds.front[1]-.02,ty,zz+.10],.061,zinc);
 for(const q of survey.openings.filter(q=>q.part===115&&q.awning)){
  const c=tall.surfaceBounds.front[0]+q.along*(tall.surfaceBounds.front[1]-tall.surfaceBounds.front[0]),y=tall.bounds[0][1];
  solid(c,y-.065,q.width+.12,.085,q.bottom+q.height+.04,q.bottom+q.height+.12,'#9ca39b');
  for(const s of [-1,1])line([c+s*(q.width/2+.03),y-.08,q.bottom-.01],[c+s*(q.width/2+.03),y-.08,q.bottom-.13],.024,zinc);
 }
 // House-number plaque: observed number, modelled strokes rather than a photo.
 const nx=extent[1]-.38,ny=lowWall-.035,nz=2.20;
 solid(nx,ny,.18,.025,nz-.07,nz+.07,'#b9b6a5');
 const strokes=[[-.068,.044,-.085,-.006],[-.085,-.006,-.033,-.006],[-.035,.045,-.035,-.049],[.0,.028,.018,.046],[.018,.046,.053,.046],[.053,.046,.070,.027],[.070,.027,.055,.006],[.055,.006,.0,-.045],[.0,-.045,.070,-.045]];
 for(const [x0,z0,x1,z1] of strokes)line([nx+x0,ny-.02,nz+z0],[nx+x1,ny-.02,nz+z1],.008,'#5b6157');

 // Curved pink paver path from the drive, around the low bed, to the entrance.
 const path=[[-6.95,-6.52],[-5.2,-6.60],[-4.1,-6.9],[-3.1,-7.35],[-1.65,-7.85],[.4,-8.03],[2.6,-8.15],[4.8,-8.1]];
 for(let i=0;i<path.length-1;i++){
  const aa=path[i],bb=path[i+1],d=norm(sub(bb,aa)),n=mul([-d[1],d[0]],.49);
  const pts=[sub(aa,n),sub(bb,n),add(bb,n),add(aa,n)];poly(pts.map(q=>at(...q,.057)),M.pavers,[.65,.53,.45],pts.map(q=>[q[0]/2,q[1]/2]));
 }
 const approach=[[split+.08,face-.1],[split+.08,-7.70]];
 for(let i=0;i<approach.length-1;i++){const aa=approach[i],bb=approach[i+1],n=[.53,0],pts=[sub(aa,n),sub(bb,n),add(bb,n),add(aa,n)];poly(pts.map(q=>at(...q,.065)),M.pavers,[.65,.53,.45],pts.map(q=>[q[0]/2,q[1]/2]));}
 // Small pots in front of the fixed pane and at the door, with narrow stems.
 for(const [xx,yy,size,col] of [[left-.13,face-.21,.22,'#615c4c'],[split-.16,face-.24,.13,'#a0957b'],[right+.13,face-.21,.14,'#883c2d']]){
  solid(xx,yy,size*1.25,size*1.25,.065,size*1.7,col);
  solid(xx,yy,size*1.32,size*1.32,size*1.56,size*1.76,col);
  for(let j=0;j<7;j++){const angle=j*2.4,dx=Math.cos(angle)*size*.8,dy=Math.sin(angle)*size*.65,z=size*2.7+.15*Math.sin(j);line([xx,yy,size*1.7],[xx+dx,yy+dy,z],.012,'#506347');poly([at(xx+dx-.055,yy+dy,z),at(xx+dx+.045,yy+dy,z+.055),at(xx+dx,yy+dy+.045,z+.08)],M.wall,rgb(j%2?'#567243':'#729057'));}
 }
 objects.push({type:'entrance-vestibule',part:o.part,adjoiningPart:112,reference:'user-close-views-2026-09-13',dimensions:'estimated',width:o.width,depth:o.bayDepth,left,split,right,wall,face,base,head,soffit:eaveZ,fixedPanePlinth:brickTop,doorWidth:doorRight-doorLeft,details:['side glazing','brick plinth','full-height glazed door','transom','door handle','tiled eaves','rainwater elbows','curved paver path']});
}
