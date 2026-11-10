"""Resume the authorized AWS domain setup; never overwrite an unrelated DNS record."""
import json
import subprocess
from pathlib import Path

DOMAIN = 'full-stack-demo.replay.io'
ZONE = 'Z02347982QPQG7RU2HGIC'
CERT = 'arn:aws:acm:us-east-1:165324622525:certificate/fb704fde-3946-4ed4-a142-fb312b375f54'
OUT = Path(__file__).resolve().parents[1] / '.outputs'
OUT.mkdir(exist_ok=True)

def aws(*args):
    result = subprocess.run(['aws', *args, '--profile', 'ReplayProductionAdmin', '--output', 'json'], check=True, capture_output=True, text=True)
    return json.loads(result.stdout) if result.stdout.strip() else {}

def change(record):
    records = aws('route53', 'list-resource-record-sets', '--hosted-zone-id', ZONE)['ResourceRecordSets']
    existing = next((r for r in records if r['Name'].rstrip('.') == record['Name'].rstrip('.') and r['Type'] == record['Type']), None)
    if existing:
        assert existing == record, f'Conflicting DNS record: {existing}'
        return
    aws('route53', 'change-resource-record-sets', '--hosted-zone-id', ZONE, '--change-batch', json.dumps({'Changes': [{'Action': 'CREATE', 'ResourceRecordSet': record}]}))

cert = aws('acm', 'describe-certificate', '--region', 'us-east-1', '--certificate-arn', CERT)['Certificate']
for validation in cert.get('DomainValidationOptions', []):
    rr = validation.get('ResourceRecord')
    if rr:
        change({'Name': rr['Name'], 'Type': rr['Type'], 'TTL': 300, 'ResourceRecords': [{'Value': rr['Value']}]})
print('Certificate:', cert['Status'], flush=True)
if cert['Status'] != 'ISSUED':
    raise SystemExit('Validation record installed. Rerun after ACM issues the certificate.')

items = aws('cloudfront', 'list-distributions').get('DistributionList', {}).get('Items', [])
distribution = next((d for d in items if DOMAIN in d.get('Aliases', {}).get('Items', [])), None)
if not distribution:
    config = {
        'CallerReference': 'threadline-full-stack-demo-v1',
        'Aliases': {'Quantity': 1, 'Items': [DOMAIN]},
        'Origins': {'Quantity': 1, 'Items': [{
            'Id': 'threadline-worker', 'DomainName': 'threadline-replay.bhackett.workers.dev',
            'CustomOriginConfig': {'HTTPPort': 80, 'HTTPSPort': 443, 'OriginProtocolPolicy': 'https-only', 'OriginSslProtocols': {'Quantity': 1, 'Items': ['TLSv1.2']}, 'OriginReadTimeout': 60, 'OriginKeepaliveTimeout': 5}
        }]},
        'DefaultCacheBehavior': {
            'TargetOriginId': 'threadline-worker', 'ViewerProtocolPolicy': 'redirect-to-https',
            'AllowedMethods': {'Quantity': 7, 'Items': ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'], 'CachedMethods': {'Quantity': 2, 'Items': ['GET', 'HEAD']}},
            'CachePolicyId': '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
            'OriginRequestPolicyId': 'b689b0a8-53d0-40ab-baf2-68738e2966ac',
            'Compress': True
        },
        'Comment': 'Full Stack Demo full-stack replay demo; Cloudflare Worker origin',
        'Enabled': True, 'PriceClass': 'PriceClass_100',
        'ViewerCertificate': {'ACMCertificateArn': CERT, 'SSLSupportMethod': 'sni-only', 'MinimumProtocolVersion': 'TLSv1.2_2021'},
        'HttpVersion': 'http2', 'IsIPV6Enabled': True
    }
    (OUT / 'demo-cloudfront-config.json').write_text(json.dumps(config, indent=2))
    distribution = aws('cloudfront', 'create-distribution', '--distribution-config', json.dumps(config))['Distribution']

for kind in ['A', 'AAAA']:
    change({'Name': DOMAIN + '.', 'Type': kind, 'AliasTarget': {'HostedZoneId': 'Z2FDTNDATAQYW2', 'DNSName': distribution['DomainName'] + '.', 'EvaluateTargetHealth': False}})
summary = {'domain': DOMAIN, 'distributionId': distribution['Id'], 'cloudfrontDomain': distribution['DomainName'], 'certificateArn': CERT}
(OUT / 'demo-domain.json').write_text(json.dumps(summary, indent=2))
print(json.dumps(summary, indent=2))
print('Status:', aws('cloudfront', 'get-distribution', '--id', distribution['Id'])['Distribution']['Status'])
