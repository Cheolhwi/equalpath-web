#!/usr/bin/env python3
"""Isolated native PostgreSQL lifecycle. No network/cloud calls."""
import hashlib, os, pathlib, subprocess, sys, tempfile, shutil
ROOT=pathlib.Path(__file__).resolve().parents[1]
STATE=ROOT/'.local'; PGDATA=STATE/'pgdata'
SOCKET=pathlib.Path(tempfile.gettempdir())/('equalpath-pg-'+str(os.getuid())+'-'+hashlib.sha256(str(ROOT).encode()).hexdigest()[:10])
def env():
    return {**os.environ,'PGHOST':str(SOCKET),'PGPORT':'55432','PGUSER':'equalpath','PGDATABASE':'equalpath','PGCONNECT_TIMEOUT':'5'}
def run(args,**kw): return subprocess.run(args,check=True,env=env(),**kw)
def main():
    action=sys.argv[1] if len(sys.argv)>1 else 'status'
    if action=='start':
        STATE.mkdir(exist_ok=True); SOCKET.mkdir(mode=0o700,exist_ok=True)
        if not (PGDATA/'PG_VERSION').exists():
            binary=pathlib.Path(shutil.which('initdb') or 'initdb').resolve()
            share=binary.parent.parent/'share/postgresql'
            options=['-L',str(share)] if (share/'postgres.bki').exists() else []
            run(['initdb',*options,'-D',str(PGDATA),'-U','equalpath','--auth-local=trust','--auth-host=reject','--encoding=UTF8','--no-locale','--set=timezone=GMT','--set=log_timezone=GMT'])
        running=subprocess.run(['pg_ctl','-D',str(PGDATA),'status'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
        if not running: run(['pg_ctl','-D',str(PGDATA),'-l',str(STATE/'postgres.log'),'-o',f"-k {SOCKET} -p 55432 -c listen_addresses=''",'-w','start'])
        exists=run(['psql','-X','-d','postgres','-Atc',"SELECT 1 FROM pg_database WHERE datname='equalpath'"],capture_output=True,text=True).stdout.strip()
        if not exists: run(['createdb','equalpath'])
        print('Ready: '+str(SOCKET)+' port 55432, user/database equalpath; TCP disabled.')
    elif action=='test': run(['node','database/postgres/tests/runtime.mjs'],cwd=ROOT.parents[1])
    elif action=='app': run(['node','node_modules/vite/bin/vite.js','--config','database/postgres/vite.config.mjs'],cwd=ROOT.parents[1])
    elif action=='stop': run(['pg_ctl','-D',str(PGDATA),'-m','fast','-w','stop'])
    elif action=='status': run(['pg_ctl','-D',str(PGDATA),'status'])
    elif action=='psql': run(['psql','-X','-v','ON_ERROR_STOP=1',*sys.argv[2:]])
    else: raise SystemExit('Usage: local.py start|stop|status|psql [arguments]')
if __name__=='__main__': main()
