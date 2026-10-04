from pathlib import Path
import subprocess
import sys
Path('test-results').mkdir(exist_ok=True)
for case, output, expected in [('synthetic', 'revised.sla', 'expected.json'), ('noop', 'noop.sla', 'noop-expected.json')]:
    subprocess.run([sys.executable,'tools/oracle.py','--current','generated/current.sla','--output','generated/'+output,'--expected','generated/'+expected,'--report','test-results/oracle-'+case+'.json'],check=True)
