name="./allFiredEvents"
echo "Number of params $# with value $@"
path=$(dirname "$name")
filename=$(basename "$name")
filename="${filename%.*}"
if [[ -e $path/$filename ]] ; then
    i=2
    while [[ -e $path/$filename-$i ]] ; do
        let i++
    done
    filename=$filename-$i
fi
target=$path/$filename
echo "Copying $name to $target"
cp $name $target
