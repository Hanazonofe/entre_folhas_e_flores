(() => {
  const $=selector=>document.querySelector(selector),notice=$('#adminNotice');let users=[];
  async function refresh(){
    users=await API.call('/users');
    $('#usersList').innerHTML=users.map(user=>`<div class="product-card"><strong>${API.esc(user.name)} (${API.esc(user.login)})</strong><p>${user.role==='admin'?'Administrador':'Operador'} · ${user.active?'Ativo':'Inativo'}</p><button type="button" data-edit-user="${user.id}">Editar usuário</button></div>`).join('');
    const backup=await API.call('/backups');
    $('#backupStatus').textContent=`Último gerado: ${backup.last_generated?API.date(backup.last_generated):'nenhum'}. Último enviado: ${backup.last_uploaded?API.date(backup.last_uploaded):'nenhum'}. Pendentes: ${backup.pending}. ${backup.overdue?'ATENÇÃO: sem envio confirmado nas últimas 26 horas.':''}`;
    $('#backupRuns').innerHTML=backup.items.map(row=>`<li>${API.date(row.created_at)} · ${API.esc(row.status)} ${row.error?'· '+API.esc(row.error):''}</li>`).join('');notice.textContent='';
  }
  $('#passwordForm').addEventListener('submit',event=>{event.preventDefault();API.run($('#passwordNotice'),async()=>{await API.call('/auth/password',{method:'POST',body:JSON.stringify({current_password:$('#currentPassword').value,new_password:$('#newPassword').value})});location.href='login.html';});});
  $('#userForm').addEventListener('submit',event=>{event.preventDefault();API.run(notice,async()=>{
    const id=$('#userId').value,old=users.find(row=>row.id===id);
    const body=old?{version:old.version,name:$('#userName').value,role:$('#userRole').value,active:$('#userActive').checked}:{login:$('#userLogin').value,name:$('#userName').value,role:$('#userRole').value,password:$('#userPassword').value};
    await API.call('/users'+(old?'/'+id:''),{method:old?'PUT':'POST',body:JSON.stringify(body)});clear();await refresh();notice.textContent='Usuário salvo. Alterações de permissão encerram as sessões desse usuário.';
  });});
  function clear(){ $('#userForm').reset();$('#userId').value='';$('#userLogin').disabled=false;$('#userPassword').required=true;$('#newUserPassword').hidden=false;$('#userActive').checked=true; }
  $('#clearUser').addEventListener('click',clear);
  $('#usersList').addEventListener('click',event=>{const button=event.target.closest('[data-edit-user]');if(!button)return;const user=users.find(row=>row.id===button.dataset.editUser);$('#userId').value=user.id;$('#userName').value=user.name;$('#userLogin').value=user.login;$('#userLogin').disabled=true;$('#userRole').value=user.role;$('#userActive').checked=user.active;$('#newUserPassword').hidden=true;$('#userPassword').required=false;});
  $('#backupNow').addEventListener('click',()=>API.run(notice,async()=>{await API.call('/backups',{method:'POST',body:'{}'});await refresh();notice.textContent='Backup solicitado. O envio depende da configuração do Drive e de acesso à internet.';}));
  $('#refreshAdmin').addEventListener('click',()=>API.run(notice,refresh));
  API.run(notice,async()=>{await API.ready();API.header();if(API.user.role==='admin'){$('#adminOnly').hidden=false;await refresh();}else notice.textContent='';});
})();
