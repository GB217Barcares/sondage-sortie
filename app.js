'use strict';
const DATES = [{id:'2026-12-04',short:'04/12'},{id:'2026-12-11',short:'11/12'},{id:'2026-12-18',short:'18/12'}];
const $ = id => document.getElementById(id);
const config = window.SONDAGE_CONFIG || {};

config.supabaseUrl = String(config.supabaseUrl || '')
  .trim()
  .replace(/\/rest\/v1\/?$/i, '')
  .replace(/\/+$/, '');

config.supabaseKey = String(config.supabaseKey || '').trim();

const configured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl) &&
  config.supabaseKey.length > 20 &&
  !config.supabaseKey.includes('VOTRE_');

console.log('Configuration Supabase :', {
  url: config.supabaseUrl,
  configured: configured
});
const storageKey = 'sortie-sondage-2026-vote-token';
let currentToken = localStorage.getItem(storageKey);
let saving = false;
const form = $('voteForm');
$('setupNotice').hidden = !!configured;
$('submitButton').disabled = !configured;

function message(text,bad=false){$('formMessage').textContent=text;$('formMessage').classList.toggle('bad',bad)}
function errorBanner(text){$('globalError').textContent=text;$('globalError').hidden=!text}
async function api(path, options={}){
  const response = await fetch(config.supabaseUrl.replace(/\/$/,'')+'/rest/v1/'+path, {
    ...options,
    headers:{'apikey':config.supabaseKey,'Authorization':'Bearer '+config.supabaseKey,'Content-Type':'application/json',...(options.headers||{})}
  });
  if(!response.ok){let details='';try{const data=await response.json();details=data.message||data.error||''}catch{}throw new Error(details||'Erreur réseau ('+response.status+')')}
  if(response.status===204)return null;
  return response.json();
}
function newToken(){if(!crypto.randomUUID)throw new Error('Un navigateur récent avec HTTPS est nécessaire.');return crypto.randomUUID()}
function checkedDates(){return [...form.querySelectorAll('input[name="date"]:checked')].map(x=>x.value)}
function formatDate(id){return DATES.find(x=>x.id===id)?.short||id}
function fillMyVote(v){$('name').value=v.display_name;$('petanque').checked=v.petanque;$('escape').checked=v.escape_game;form.querySelectorAll('input[name="date"]').forEach(x=>x.checked=v.dates.includes(x.value));$('submitButton').firstChild.textContent='Modifier mon vote '}
async function restoreVote(){if(!configured||!currentToken)return;try{const data=await api('rpc/get_my_vote',{method:'POST',body:JSON.stringify({p_token:currentToken})});if(data)fillMyVote(data)}catch(err){console.warn('Restauration du vote impossible',err)}}
form.addEventListener('submit',async e=>{
  e.preventDefault();if(saving||!configured)return;
  const name=$('name').value.trim();const petanque=$('petanque').checked;const escape=$('escape').checked;const dates=checkedDates();
  if(name.length<2||name.length>70){message('Indique ton prénom et ton nom (2 à 70 caractères).',true);return}
  if(!petanque&&!escape){message('Sélectionne au moins une activité.',true);return}
  if(!dates.length){message('Sélectionne au moins une date.',true);return}
  const token=currentToken||newToken();saving=true;$('submitButton').disabled=true;message('Enregistrement en cours…');
  try{
    await api('rpc/save_vote',{method:'POST',body:JSON.stringify({p_token:token,p_display_name:name,p_petanque:petanque,p_escape_game:escape,p_dates:dates})});
    currentToken=token;localStorage.setItem(storageKey,token);$('submitButton').firstChild.textContent='Modifier mon vote ';message('✓ Vote enregistré ! Tu peux revenir le modifier depuis cet appareil.');await loadVotes();
  }catch(err){message('Impossible d’enregistrer : '+err.message,true)}finally{saving=false;$('submitButton').disabled=false}
});
function pill(text,green=false){const span=document.createElement('span');span.className='pill'+(green?' green':'');span.textContent=text;return span}
function renderVotes(votes){
  const total=votes.length,petanque=votes.filter(v=>v.petanque).length,escape=votes.filter(v=>v.escape_game).length;
  $('participantCount').textContent=total;$('petanqueCount').textContent=petanque;$('escapeCount').textContent=escape;
  const counts=DATES.map(d=>({ ...d,count:votes.filter(v=>v.dates.includes(d.id)).length}));const max=Math.max(1,...counts.map(d=>d.count));
  const bars=$('dateBars');bars.replaceChildren();
  for(const d of counts){const wrap=document.createElement('div');const top=document.createElement('div');top.className='bar-top';const label=document.createElement('span');label.textContent='Vendredi '+d.short;const count=document.createElement('span');count.textContent=d.count+' vote'+(d.count>1?'s':'');top.append(label,count);const track=document.createElement('div');track.className='track';const fill=document.createElement('div');fill.className='fill';fill.style.width=(d.count/max*100)+'%';track.append(fill);wrap.append(top,track);bars.append(wrap)}
  const bestDates=counts.filter(d=>d.count===Math.max(...counts.map(x=>x.count))).map(d=>d.short);
  const bestActivity=petanque===escape?'Égalité entre les deux activités':petanque>escape?'La pétanque arrive en tête':'L’escape game arrive en tête';
  $('leader').textContent=total?('🏆 '+bestActivity+' · Date'+(bestDates.length>1?'s':'')+' la/les plus populaire(s) : '+bestDates.join(', ')):'✨ Sois la première personne à voter !';
  const body=$('votesBody');body.replaceChildren();
  if(!total){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=3;td.className='empty';td.textContent='Aucun vote pour le moment.';tr.append(td);body.append(tr)}
  for(const vote of votes){const tr=document.createElement('tr');const name=document.createElement('td');name.textContent=vote.display_name;const activities=document.createElement('td');if(vote.petanque)activities.append(pill('🎯 Pétanque',true));if(vote.escape_game)activities.append(pill('🔐 Escape game'));const dates=document.createElement('td');for(const d of DATES)if(vote.dates.includes(d.id))dates.append(pill(d.short));tr.append(name,activities,dates);body.append(tr)}
  $('updatedAt').textContent='Mis à jour à '+new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
}
async function loadVotes(){if(!configured)return;try{const votes=await api('public_votes?select=display_name,petanque,escape_game,dates&order=display_name.asc');renderVotes(votes);errorBanner('')}catch(err){errorBanner('Impossible de charger les résultats : '+err.message)}}
$('refreshButton').addEventListener('click',loadVotes);
if(configured){restoreVote();loadVotes();setInterval(()=>{if(!document.hidden)loadVotes()},15000)}
