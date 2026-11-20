from pathlib import Path
import os, json, getpass
root=Path(__file__).resolve().parents[1]
allowed={'CMC_PRO_API_KEY','CMC_API_KEY','ZERION_API_KEY','DATABASE_URL','LIFI_API_KEY','SESSION_SECRET','RECONCILE_SECRET','APP_ORIGIN','GENLAYER_RPC_URL','GENLAYER_CONTRACT_ADDRESS','GENLAYER_SPONSOR_PRIVATE_KEY'}
values={}
for source in [root.parent/'cmc.env',root/'.env.local']:
    if not source.exists(): continue
    for line in source.read_text().splitlines():
        if '=' not in line: continue
        key,value=line.strip().removeprefix('export ').split('=',1)
        if key.strip() in allowed: values[key.strip()]=value.strip().strip('"').strip("'")
if not values.get('CMC_PRO_API_KEY'): values['CMC_PRO_API_KEY']=values.pop('CMC_API_KEY','')
for key in ['CMC_PRO_API_KEY','ZERION_API_KEY']:
    if not values.get(key): values[key]=getpass.getpass(key+' (hidden): ')
import secrets
values['SESSION_SECRET']=values.get('SESSION_SECRET') or secrets.token_hex(32)
values['RECONCILE_SECRET']=values.get('RECONCILE_SECRET') or secrets.token_hex(32)
values['APP_ORIGIN']=values.get('APP_ORIGIN') or 'http://localhost:3000'
output=root/'.env.local'
fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
os.fchmod(fd,0o600)
with os.fdopen(fd,'w') as file:
    file.write('\n'.join(key+'='+json.dumps(value) for key,value in values.items())+'\n')
print('Saved app credentials to .env.local with mode 600. Wallet funding keys were excluded.')
