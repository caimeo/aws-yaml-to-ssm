<!-- @format -->

# aws-yaml-to-ssm

A github action to uploads SSM parameters from a set of yaml files

Pushes the contents of the provided directory of yaml files to AWS SSM as parameters.

## Usage

Create a directory in your repo that contains nested set of folders containing yaml files that you want to load as SSM parameters to AWS.

Reference that folder in the path setting of the workflow step.

-   All files in the path directory are parsed and used, as parameter sources.
-   Allows you to control the SSM Prefix that will be used
-   The parameter name is determined by combining the prefix, the file path, file name, yaml path, and yaml parameter.
-   The parameter value is the yaml parameter value.
-   If "clean" (optional) is set to true, ALL existing parameters under the prefix that do not exist in the yaml, will be removed.
-   Numbers and strings are stored as String Parameters
-   Arrays are save as StringList Parameters

#### Example

**configs directory:**

```sh
configs/
  |- foo/
    |- bar/
      |- a.yml
      |- b.yaml
    |- empty/
```

**_configs/foo/bar/a.yml:_**

```yaml
alpha: testValueAlpha
beta: 5
```

**_configs/foo/bar/b.yml:_**

```yaml
gamma: testValueGamma
delta:
    - a1
    - b2
    - c3
```

**workflow step:**

```yaml
steps:
    - uses: caimeo/aws-yaml-to-ssm
        with:
            prefix: 'fiz/buz'
            path: './configs'
            aws_access_key_id: '000000'
            aws_secret_access_key: '000000'
            aws_region: 'us-east-1'
            aws_account_id: '0123456789'
            clean: true
```

In this example the following parameters will be created in `us-east-2` under the account `0123456789`

```
/fiz/buz/foo/bar/a/alpha    "testValueAlpha"  (String)
/fiz/buz/foo/bar/a/beta     "5"               (String)
/fiz/buz/foo/bar/b/gamma    "testValueGamma"  (String)
/fiz/buz/foo/bar/b/delta    "a1,b2,c3"        (StringList)
```

## Credentials and Region

This action requires you to provide AWS credentials with appropriate access to configure the GitHub Actions environment with environment variables containing AWS credentials and your desired region.

We recommend following [Amazon IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) for the AWS credentials used in GitHub Actions workflows, including:

-   Do not store credentials in your repository's code. You may use [GitHub Actions secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets) to store credentials and redact credentials from GitHub Actions workflow logs.
-   [Create an individual IAM user](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#create-iam-users) with an access key for use in GitHub Actions workflows, preferably one per repository. Do not use the AWS account root user access key.
-   [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege) to the credentials used in GitHub Actions workflows. Grant only the permissions required to perform the actions in your GitHub Actions workflows. See the Permissions section below for the permissions required by this action.
-   [Rotate the credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#rotate-credentials) used in GitHub Actions workflows regularly.
-   [Monitor the activity](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#keep-a-log) of the credentials used in GitHub Actions workflows.

## Permissions

This action requires the following minimum set of permissions:

> We recommend to read [AWS CloudFormation Security Best Practices](https://aws.amazon.com/blogs/devops/aws-cloudformation-security-best-practices/)

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ssm:PutParameter",
                "ssm:LabelParameterVersion",
                "ssm:DeleteParameter",
                "ssm:UnlabelParameterVersion",
                "ssm:DescribeParameters",
                "ssm:GetParameterHistory",
                "ssm:GetParametersByPath",
                "ssm:GetParameters",
                "ssm:GetParameter",
                "ssm:DeleteParameters"
            ],
            "Resource": "*"
        }
    ]
}
```

## License

[MIT](LICENSE)
