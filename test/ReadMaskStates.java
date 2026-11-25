import java.nio.file.*;
import java.util.*;
import com.google.gson.*;
import net.minecraft.SharedConstants;
import net.minecraft.server.Bootstrap;
import net.minecraft.core.*;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.EmptyBlockGetter;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
public class ReadMaskStates {
 static <T extends Comparable<T>> String stateValue(BlockState state, Property<T> p){return p.getName(state.getValue(p));}
 static <T extends Comparable<T>> JsonArray values(Property<T> p){var a=new JsonArray();for(T v:p.getPossibleValues())a.add(p.getName(v));return a;}
 public static void main(String[] args)throws Exception{
  SharedConstants.tryDetectVersion();Bootstrap.bootStrap();
  var fluids=new TreeMap<String,Integer>();for(String id:List.of("empty","water","flowing_water","lava","flowing_lava"))fluids.put("minecraft:"+id,fluids.size());
  JsonObject out=new JsonObject();String[] dirs={"down","up","north","south","west","east"};
  for(var e:BuiltInRegistries.BLOCK.entrySet()){
   var block=e.getValue();var def=block.defaultBlockState();var props=def.getProperties().stream().sorted(Comparator.comparing(Property::getName)).toList();
   JsonObject states=new JsonObject();int defaultFlags=0;
   for(var s:block.getStateDefinition().getPossibleStates()){
    int n=(s.isSolid()?1:0)|(s.canBeReplaced()?2:0);
    for(int i=0;i<dirs.length;i++)if(s.isFaceSturdy(EmptyBlockGetter.INSTANCE,BlockPos.ZERO,Direction.valueOf(dirs[i].toUpperCase(Locale.ROOT))))n|=4<<i;
    n|=fluids.get(BuiltInRegistries.FLUID.getKey(s.getFluidState().getType()).toString())<<8;
    if(s==def)defaultFlags=n;
    states.addProperty(String.join(",",props.stream().map(p->stateValue(s,p)).toList()),n);
   }
   final int base=defaultFlags;
   var different=states.entrySet().stream().filter(x->x.getValue().getAsInt()!=base).toList();
   if(different.isEmpty()){out.addProperty(e.getKey().identifier().toString(),base);continue;}
   JsonObject overrides=new JsonObject();for(var o:different)overrides.add(o.getKey(),o.getValue());
   JsonArray row=new JsonArray(),names=new JsonArray(),defaults=new JsonArray(),allowed=new JsonArray();for(var p:props){names.add(p.getName());defaults.add(stateValue(def,p));allowed.add(values(p));}
   row.add(base);row.add(names);row.add(defaults);row.add(overrides);row.add(allowed);out.add(e.getKey().identifier().toString(),row);
  }
  Files.writeString(Path.of(args[0]),new Gson().toJson(out));System.out.println("MASK_STATES_OK "+out.size());
 }
}
