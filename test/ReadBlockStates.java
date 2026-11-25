import net.minecraft.SharedConstants;
import net.minecraft.server.Bootstrap;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import com.google.gson.*;
import java.nio.file.*;
import java.util.*;
public class ReadBlockStates {
 static <T extends Comparable<T>> JsonObject prop(Property<T> p, net.minecraft.world.level.block.state.BlockState state){
  JsonObject out=new JsonObject();JsonArray values=new JsonArray();for(T v:p.getPossibleValues())values.add(p.getName(v));
  out.add("values",values);out.addProperty("default",p.getName(state.getValue(p)));return out;
 }
 static <T extends Comparable<T>> String value(BlockState s,Property<T> p){return p.getName(s.getValue(p));}
 static JsonObject rotation(List<BlockState> states, List<Property<?>> props) {
  var rotated=states.stream().map(s->s.rotate(Rotation.CLOCKWISE_90)).toList();
  var rules=new JsonObject();
  for(var to:props){
   if(java.util.stream.IntStream.range(0,states.size()).allMatch(i->value(states.get(i),to).equals(value(rotated.get(i),to))))continue;
   boolean found=false;
   for(var from:props){
    var map=new LinkedHashMap<String,String>();boolean fits=true;
    for(int i=0;i<states.size();i++){
     var before=value(states.get(i),from);var after=value(rotated.get(i),to);
     var old=map.putIfAbsent(before,after);if(old!=null&&!old.equals(after)){fits=false;break;}
    }
    if(!fits)continue;
    var pair=new JsonArray();pair.add(from.getName());var changes=new JsonObject();
    map.forEach((k,v)->{if(!k.equals(v))changes.addProperty(k,v);});pair.add(changes);rules.add(to.getName(),pair);found=true;break;
   }
   if(!found)throw new IllegalStateException("Cannot encode rotation of "+states.getFirst()+" property "+to);
  }
  return rules;
 }
 public static void main(String[] args)throws Exception{
  SharedConstants.tryDetectVersion();Bootstrap.bootStrap();JsonObject all=new JsonObject(),turns=new JsonObject();
  BuiltInRegistries.BLOCK.entrySet().stream().sorted(Comparator.comparing(v->v.getKey().identifier().toString())).forEach(e->{
   var def=e.getValue().defaultBlockState();var properties=def.getProperties().stream().sorted(Comparator.comparing(Property::getName)).toList();var props=new JsonObject();properties.forEach(p->props.add(p.getName(),prop(p,def)));var key=e.getKey().identifier().toString();all.add(key,props);
   if(args.length>1){var rules=rotation(e.getValue().getStateDefinition().getPossibleStates(),properties);if(!rules.isEmpty())turns.add(key,rules);}
  });Files.writeString(Path.of(args[0]),new Gson().toJson(all));System.out.println("REGISTRY_SCHEMA_OK "+all.size());
  if(args.length>1){Files.writeString(Path.of(args[1]),new Gson().toJson(turns));System.out.println("NATIVE_ROTATION_OK "+turns.size());}
 }
}
